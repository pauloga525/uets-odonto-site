import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettings, settingsSchema } from '@odonto/shared';
import { Ctx, Public, RequestContext, Roles } from '../../common/auth-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
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
}
