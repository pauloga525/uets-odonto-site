import { Injectable } from '@nestjs/common';
import { ErrorCode, Role, matchesEmailPattern } from '@odonto/shared';
import { PrismaService } from '../../common/prisma.service';
import { AppConfig } from '../../config/app-config';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';

export interface LoginIdentity {
  email: string;
  name: string;
  googleSub: string | null;
  picture: string | null;
  hostedDomain: string | null;
  emailVerified: boolean;
}

export class LoginRejected extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private bootstrapRole(email: string): Role | null {
    if (email === this.config.bootstrapAdminEmail) return 'ADMIN';
    if (email === this.config.bootstrapDoctorEmail) return 'DOCTOR';
    return null;
  }

  /** Verifica que el correo pertenezca a un dominio autorizado. */
  async isDomainAllowed(email: string, hostedDomain: string | null): Promise<boolean> {
    if (this.bootstrapRole(email)) return true;
    const { allowedDomains } = await this.settings.get();
    if (allowedDomains.length === 0) return true;
    const domain = email.split('@')[1] ?? '';
    if (!allowedDomains.includes(domain)) return false;
    // Si Google informa el dominio de Workspace (claim hd), debe coincidir con el del correo.
    return hostedDomain === null || hostedDomain === domain;
  }

  /** ¿El correo está excluido por patrón? (p. ej. cuentas estudiantiles `*.est@uets.edu.ec`). */
  async isEmailBlocked(email: string): Promise<boolean> {
    if (this.bootstrapRole(email)) return false;
    const { blockedEmailPatterns } = await this.settings.get();
    return blockedEmailPatterns.some((p) => matchesEmailPattern(email, p));
  }

  /** Crea o actualiza el usuario tras autenticarse. Lanza LoginRejected si no puede ingresar. */
  async login(identity: LoginIdentity, meta: { ip: string | null; userAgent: string | null }) {
    const email = identity.email.toLowerCase();
    if (!identity.emailVerified) throw new LoginRejected('DOMAIN_NOT_ALLOWED');
    if (!(await this.isDomainAllowed(email, identity.hostedDomain))) {
      await this.audit.log({ ip: meta.ip, userAgent: meta.userAgent }, { action: 'LOGIN_RECHAZADO_DOMINIO', entity: 'user', metadata: { email } });
      throw new LoginRejected('DOMAIN_NOT_ALLOWED');
    }
    if (await this.isEmailBlocked(email)) {
      await this.audit.log({ ip: meta.ip, userAgent: meta.userAgent }, { action: 'LOGIN_RECHAZADO_CUENTA_BLOQUEADA', entity: 'user', metadata: { email } });
      throw new LoginRejected('EMAIL_NOT_ALLOWED');
    }

    let user =
      (identity.googleSub ? await this.prisma.user.findUnique({ where: { googleSub: identity.googleSub } }) : null) ??
      (await this.prisma.user.findUnique({ where: { email } }));

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: identity.name,
          googleSub: identity.googleSub,
          avatarUrl: identity.picture,
          role: this.bootstrapRole(email) ?? 'PATIENT',
        },
      });
    } else {
      if (!user.active) throw new LoginRejected('USER_INACTIVE');
      // Un correo configurado en BOOTSTRAP_*_EMAIL que ya existía como paciente se promueve a su rol.
      // Solo promueve desde PATIENT: nunca revierte un cambio de rol hecho por el administrador.
      const promoteTo = user.role === 'PATIENT' ? this.bootstrapRole(email) : null;
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleSub: user.googleSub ?? identity.googleSub,
          name: identity.name || user.name,
          avatarUrl: identity.picture ?? user.avatarUrl,
          lastLoginAt: new Date(),
          ...(promoteTo ? { role: promoteTo } : {}),
        },
      });
      if (promoteTo) {
        await this.audit.log(
          { user: { id: user.id } as any, ip: meta.ip, userAgent: meta.userAgent },
          { action: 'PROMOCION_ROL_CONFIGURADO', entity: 'user', entityId: user.id, metadata: { from: 'PATIENT', to: promoteTo } },
        );
      }
    }
    if (user.role === 'DOCTOR') await this.users.ensureDoctorProfile(user.id, user.name);

    await this.audit.log(
      { user: { id: user.id } as any, ip: meta.ip, userAgent: meta.userAgent },
      { action: 'LOGIN', entity: 'user', entityId: user.id },
    );
    return user;
  }
}
