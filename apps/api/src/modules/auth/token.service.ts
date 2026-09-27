import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@odonto/shared';
import type { CookieOptions, Response } from 'express';
import { CryptoService } from '../../common/crypto.service';
import { PrismaService } from '../../common/prisma.service';
import { AppConfig } from '../../config/app-config';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const OAUTH_TX_COOKIE = 'oauth_tx';
const AUTH_PATH = '/api/v1/auth';

export interface AccessPayload {
  sub: string;
  role: Role;
}

/**
 * Sesión propia del sistema:
 *  - access token JWT de corta duración (15 min) en cookie httpOnly
 *  - refresh token opaco y rotativo (7 días), guardado como hash; si se reutiliza uno revocado
 *    se revocan todas las sesiones del usuario (detección de robo).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private cookieBase(): CookieOptions {
    return { httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax' };
  }

  async issueSession(res: Response, user: { id: string; role: Role }): Promise<void> {
    const access = await this.jwt.signAsync({ sub: user.id, role: user.role } satisfies AccessPayload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.accessTtlSeconds,
    });
    const refresh = CryptoService.randomToken(48);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: CryptoService.sha256(refresh),
        expiresAt: new Date(Date.now() + this.config.refreshTtlSeconds * 1000),
      },
    });
    res.cookie(ACCESS_COOKIE, access, { ...this.cookieBase(), path: '/api', maxAge: this.config.accessTtlSeconds * 1000 });
    res.cookie(REFRESH_COOKIE, refresh, { ...this.cookieBase(), path: AUTH_PATH, maxAge: this.config.refreshTtlSeconds * 1000 });
  }

  async verifyAccess(token: string | undefined): Promise<AccessPayload | null> {
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync<AccessPayload>(token, { secret: this.config.jwtAccessSecret });
    } catch {
      return null;
    }
  }

  /** Rota el refresh token. Devuelve el userId o null si no es válido. */
  async rotate(refresh: string | undefined): Promise<string | null> {
    if (!refresh) return null;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: CryptoService.sha256(refresh) } });
    if (!row) return null;
    if (row.revokedAt) {
      await this.revokeAll(row.userId);
      return null;
    }
    if (row.expiresAt < new Date()) return null;
    const res = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count === 1 ? row.userId : null;
  }

  async revoke(refresh: string | undefined): Promise<void> {
    if (!refresh) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: CryptoService.sha256(refresh), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  clearSession(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieBase(), path: '/api' });
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieBase(), path: AUTH_PATH });
  }

  /* ---- Transacción OAuth (state + PKCE verifier) firmada en cookie de 10 min ---- */

  async setOAuthTx(res: Response, tx: { state: string; verifier: string }): Promise<void> {
    const token = await this.jwt.signAsync(tx, { secret: this.config.jwtAccessSecret, expiresIn: 600 });
    res.cookie(OAUTH_TX_COOKIE, token, { ...this.cookieBase(), path: AUTH_PATH, maxAge: 600_000 });
  }

  async readOAuthTx(res: Response, token: string | undefined): Promise<{ state: string; verifier: string } | null> {
    res.clearCookie(OAUTH_TX_COOKIE, { ...this.cookieBase(), path: AUTH_PATH });
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync<{ state: string; verifier: string }>(token, { secret: this.config.jwtAccessSecret });
    } catch {
      return null;
    }
  }
}
