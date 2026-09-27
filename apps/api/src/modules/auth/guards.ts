import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@odonto/shared';
import type { Request } from 'express';
import { AuthUser, IS_PUBLIC, ROLES_KEY } from '../../common/auth-context';
import { DomainException } from '../../common/domain.exception';
import { UsersService } from '../users/users.service';
import { ACCESS_COOKIE, TokenService } from './token.service';

/**
 * Autenticación global: toda ruta requiere sesión salvo @Public().
 * Se consulta el usuario en BD en cada request para que la desactivación
 * o el cambio de rol surtan efecto de inmediato.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const payload = await this.tokens.verifyAccess(req.cookies?.[ACCESS_COOKIE]);
    if (!payload) throw new DomainException('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);

    const user = await this.users.findAuthUser(payload.sub);
    if (!user) throw new DomainException('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    req.user = user;
    return true;
  }
}

/** Autorización por rol (RBAC) mediante @Roles(...). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) throw DomainException.forbidden();
    return true;
  }
}
