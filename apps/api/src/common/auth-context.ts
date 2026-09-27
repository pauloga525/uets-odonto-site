import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Role } from '@odonto/shared';
import type { Request } from 'express';

/** Usuario autenticado adjuntado a la request por JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  doctorId: number | null;
}

/** Contexto para auditoría. */
export interface RequestContext {
  user: AuthUser;
  ip: string | null;
  userAgent: string | null;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
});

export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestContext => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return { user: req.user, ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 300) ?? null };
});
