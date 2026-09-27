import { Injectable, NestMiddleware } from '@nestjs/common';
import { ERROR_MESSAGES } from '@odonto/shared';
import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../config/app-config';
import { CryptoService } from './crypto.service';

export const XSRF_COOKIE = 'XSRF-TOKEN';
export const XSRF_HEADER = 'x-xsrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF "double submit cookie".
 * Angular HttpClient lee la cookie XSRF-TOKEN y la reenvía en el header X-XSRF-TOKEN.
 * Un sitio externo no puede leer la cookie, por lo que no puede falsificar el header.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfig) {}

  use(req: Request, res: Response, next: NextFunction) {
    let token: string | undefined = req.cookies?.[XSRF_COOKIE];
    if (!token) {
      token = CryptoService.randomToken(24);
      res.cookie(XSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: this.config.cookieSecure, path: '/' });
    }
    if (SAFE_METHODS.has(req.method)) return next();

    const header = req.get(XSRF_HEADER) ?? '';
    const cookie = req.cookies?.[XSRF_COOKIE] ?? '';
    const ok = header.length > 0 && header.length === cookie.length && timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
    if (!ok) {
      res.status(403).json({ statusCode: 403, code: 'CSRF', message: ERROR_MESSAGES.CSRF });
      return;
    }
    next();
  }
}
