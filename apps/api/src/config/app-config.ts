import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  // Vacío = redirecciones relativas al mismo origen (modo túnel, cuya dirección cambia)
  WEB_URL: z.union([z.literal(''), z.string().url()]).default(''),
  APP_TIMEZONE: z.string().default('America/Guayaquil'),
  COOKIE_SECURE: bool,
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  // Vacío = se deduce de la dirección con la que se visita la app
  GOOGLE_REDIRECT_URI: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'DATA_ENCRYPTION_KEY debe ser 32 bytes en base64'),
  ALLOWED_DOMAINS: z.string().default(''),
  BLOCKED_EMAIL_PATTERNS: z.string().default('*.est@uets.edu.ec'),
  BOOTSTRAP_ADMIN_EMAIL: z.string().default(''),
  BOOTSTRAP_DOCTOR_EMAIL: z.string().default(''),
  AUTH_DEV_LOGIN: bool,
  // Correo saliente (cuenta noreply). Si falta SMTP_HOST, el envío de correos queda desactivado.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default(''),
  MAIL_REPLY_TO: z.string().default(''),
});

/** Configuración tipada y validada al arrancar (falla rápido si falta algo). */
@Injectable()
export class AppConfig {
  private readonly env = envSchema.parse(process.env);

  readonly nodeEnv = this.env.NODE_ENV;
  readonly isProd = this.env.NODE_ENV === 'production';
  readonly port = this.env.PORT;
  readonly webUrl = this.env.WEB_URL.replace(/\/$/, '');
  readonly timezone = this.env.APP_TIMEZONE;
  readonly cookieSecure = this.env.COOKIE_SECURE || this.isProd;
  readonly google = {
    clientId: this.env.GOOGLE_CLIENT_ID,
    clientSecret: this.env.GOOGLE_CLIENT_SECRET,
    redirectUri: this.env.GOOGLE_REDIRECT_URI,
    configured: !!this.env.GOOGLE_CLIENT_ID && !!this.env.GOOGLE_CLIENT_SECRET,
  };
  readonly jwtAccessSecret = this.env.JWT_ACCESS_SECRET;
  readonly encryptionKey = Buffer.from(this.env.DATA_ENCRYPTION_KEY, 'base64');
  readonly defaultAllowedDomains = splitList(this.env.ALLOWED_DOMAINS);
  readonly defaultBlockedEmailPatterns = splitList(this.env.BLOCKED_EMAIL_PATTERNS);
  readonly bootstrapAdminEmail = this.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  readonly bootstrapDoctorEmail = this.env.BOOTSTRAP_DOCTOR_EMAIL.trim().toLowerCase();
  /** El login de desarrollo jamás se habilita en producción, aunque la variable esté activa. */
  readonly devLoginEnabled = this.env.AUTH_DEV_LOGIN && !this.isProd;

  readonly mail = {
    // Con usuario, también se exige contraseña (evita reintentos inútiles con credenciales incompletas)
    configured: !!this.env.SMTP_HOST && (!this.env.SMTP_USER || !!this.env.SMTP_PASS),
    host: this.env.SMTP_HOST,
    port: this.env.SMTP_PORT,
    user: this.env.SMTP_USER,
    // Google muestra la contraseña de aplicación con espacios; se quitan por si se copió así.
    pass: this.env.SMTP_PASS.replace(/\s+/g, ''),
    from: this.env.MAIL_FROM || this.env.SMTP_USER,
    replyTo: this.env.MAIL_REPLY_TO,
  };

  readonly accessTtlSeconds = 15 * 60;
  readonly refreshTtlSeconds = 7 * 24 * 60 * 60;
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
