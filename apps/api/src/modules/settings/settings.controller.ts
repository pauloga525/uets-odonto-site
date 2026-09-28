import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettings, settingsSchema } from '@odonto/shared';
import { Ctx, Public, RequestContext, Roles } from '../../common/auth-context';
import { DomainException } from '../../common/domain.exception';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Datos públicos para la pantalla de login (nombre de la clínica, dominios aceptados). */
  @Public()
  @Get('public')
  async publicInfo() {
    const s = await this.settings.get();
    return { clinicName: s.clinicName, clinicLocation: s.clinicLocation, allowedDomains: s.allowedDomains };
  }

  @Get()
  get() {
    return this.settings.get();
  }

  @Roles('ADMIN')
  @Put()
  async update(@Body(new ZodPipe(settingsSchema)) body: AppSettings, @Ctx() ctx: RequestContext) {
    const before = await this.settings.get();
    const after = await this.settings.update(body);
    await this.audit.log(ctx, { action: 'ACTUALIZAR_CONFIGURACION', entity: 'settings', entityId: 'app', metadata: { before, after } });
    return after;
  }

  /** Estado del envío de correos: si está configurado y cuántos hay pendientes o fallidos. */
  @Roles('ADMIN')
  @Get('mail-status')
  mailStatus() {
    return this.notifications.status();
  }

  /** Envía un correo de prueba al administrador que lo solicita. */
  @Roles('ADMIN')
  @Post('test-email')
  @HttpCode(200)
  async testEmail(@Ctx() ctx: RequestContext) {
    if (!(await this.notifications.status()).configured) {
      throw DomainException.unprocessable('VALIDATION', 'El correo no está configurado en el servidor (SMTP_HOST en .env).');
    }
    try {
      await this.notifications.sendTest(ctx.user.email);
    } catch (err) {
      throw DomainException.unprocessable('VALIDATION', `No se pudo enviar el correo: ${(err as Error).message}`);
    }
    await this.audit.log(ctx, { action: 'CORREO_PRUEBA', entity: 'settings', entityId: 'mail', metadata: { to: ctx.user.email } });
    return { sentTo: ctx.user.email };
  }
}
