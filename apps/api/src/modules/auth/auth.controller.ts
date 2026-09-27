import { Body, Controller, Get, HttpCode, HttpStatus, Logger, NotFoundException, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { devLoginSchema, UserDto } from '@odonto/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public } from '../../common/auth-context';
import { CryptoService } from '../../common/crypto.service';
import { DomainException } from '../../common/domain.exception';
import { ZodPipe } from '../../common/zod.pipe';
import { AppConfig } from '../../config/app-config';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { AuthService, LoginRejected } from './auth.service';
import { GoogleOidcService } from './google-oidc.service';
import { OAUTH_TX_COOKIE, REFRESH_COOKIE, TokenService } from './token.service';

@ApiTags('auth')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleOidcService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  /** Inicia el flujo OIDC con Google. */
  @Public()
  @Get('google')
  async googleStart(@Req() req: Request, @Res() res: Response) {
    const { allowedDomains } = await this.settings.get();
    const state = CryptoService.randomToken(24);
    const redirectUri = this.redirectUri(req);
    const { url, verifier } = await this.google.createAuthRequest(state, redirectUri, allowedDomains.length === 1 ? allowedDomains[0] : undefined);
    await this.tokens.setOAuthTx(res, { state, verifier, redirectUri });
    res.redirect(url);
  }

  /**
   * URI de retorno de Google: la fija en GOOGLE_REDIRECT_URI o, si está vacía, la deducida de la
   * dirección con la que se visita la app (útil con el túnel de Cloudflare, cuya dirección cambia).
   * No abre un riesgo: Google solo acepta URIs registradas previamente en la consola.
   */
  private redirectUri(req: Request): string {
    return this.config.google.redirectUri || `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`;
  }

  /** Callback de Google: valida state/PKCE, dominio y rol; crea la sesión y redirige al frontend. */
  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const fail = (reason: string) => res.redirect(`${this.config.webUrl}/login?error=${encodeURIComponent(reason)}`);
    const tx = await this.tokens.readOAuthTx(res, req.cookies?.[OAUTH_TX_COOKIE]);
    if (error) return fail('cancelled');
    if (!code || !state || !tx || tx.state !== state) return fail('oauth');
    try {
      const identity = await this.google.exchange(code, tx.verifier, tx.redirectUri);
      const user = await this.auth.login(
        { ...identity, googleSub: identity.sub },
        { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
      );
      await this.tokens.issueSession(res, user);
      return res.redirect(`${this.config.webUrl}/`);
    } catch (err) {
      if (err instanceof LoginRejected) {
        return fail(err.code === 'USER_INACTIVE' ? 'inactive' : err.code === 'EMAIL_NOT_ALLOWED' ? 'blocked' : 'domain');
      }
      this.logger.error(`Error en callback de Google: ${(err as Error).message}`);
      return fail('oauth');
    }
  }

  /** Login de desarrollo (solo si AUTH_DEV_LOGIN=true y NODE_ENV≠production). Aplica las mismas reglas de dominio. */
  @Public()
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(@Body(new ZodPipe(devLoginSchema)) body: z.infer<typeof devLoginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!this.config.devLoginEnabled) throw new NotFoundException();
    try {
      const user = await this.auth.login(
        { email: body.email, name: body.email.split('@')[0], googleSub: null, picture: null, hostedDomain: null, emailVerified: true },
        { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
      );
      await this.tokens.issueSession(res, user);
      return this.users.toDto(await this.users.findById(user.id));
    } catch (err) {
      if (err instanceof LoginRejected) throw new DomainException(err.code, HttpStatus.FORBIDDEN);
      throw err;
    }
  }

  @Public()
  @Get('providers')
  providers() {
    return { google: this.config.google.configured, devLogin: this.config.devLoginEnabled };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<UserDto> {
    const userId = await this.tokens.rotate(req.cookies?.[REFRESH_COOKIE]);
    const user = userId ? await this.users.findById(userId).catch(() => null) : null;
    // Se revalida en cada renovación: desactivar la cuenta o bloquear su patrón cierra la sesión en ≤ 15 min.
    if (!user || !user.active || (await this.auth.isEmailBlocked(user.email))) {
      this.tokens.clearSession(res);
      throw new DomainException('UNAUTHORIZED', 401);
    }
    await this.tokens.issueSession(res, user);
    return this.users.toDto(user);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.tokens.revoke(req.cookies?.[REFRESH_COOKIE]);
    this.tokens.clearSession(res);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.toDto(await this.users.findById(user.id));
  }

  /** Registro del consentimiento de tratamiento de datos (LOPDP). */
  @Post('consent')
  @HttpCode(200)
  async consent(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<UserDto> {
    const updated = await this.users.recordConsent(user.id);
    await this.audit.log(
      { user, ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
      { action: 'CONSENTIMIENTO_DATOS', entity: 'user', entityId: user.id },
    );
    return this.users.toDto(updated);
  }
}
