import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClockService } from '../../common/clock.service';
import { fromDbDate, fromDbTime } from '../../common/db-time';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AppConfig } from '../../config/app-config';
import { SettingsService } from '../settings/settings.service';
import { buildIcs } from './ics';
import { MailData, MailKind, htmlFor, subjectFor, textFor } from './mail-templates';
import { MailerService } from './mailer.service';

/** Recordatorios de la invitación: 1 día y 1 hora antes. */
export const REMINDERS_MINUTES = [24 * 60, 60];
const MAX_ATTEMPTS = 6;
/** Espera antes de cada reintento (minutos): 1, 5, 15, 60, 180. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
const POLL_MS = 15_000;
const BATCH = 10;

/**
 * Notificaciones por correo con patrón "outbox":
 *  - `enqueue` inserta el correo en la MISMA transacción que la cita (si la cita no se guarda, tampoco el correo);
 *  - un proceso periódico envía los pendientes y reintenta con espera creciente si Gmail falla.
 * Así, un problema de correo nunca bloquea ni revierte una reserva.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    if (!this.mailer.enabled) {
      this.logger.warn('Correo no configurado (SMTP_HOST vacío): no se enviarán notificaciones.');
      return;
    }
    if (this.config.nodeEnv === 'test') return; // en pruebas la cola se procesa manualmente
    this.timer = setInterval(() => void this.processQueue(), POLL_MS);
    this.logger.log(`Envío de correos activo como ${this.mailer.from}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Encola un correo para el paciente dentro de la transacción de la cita. */
  async enqueue(tx: Tx, appointmentId: number, kind: MailKind, toEmail: string, sequence: number): Promise<void> {
    if (!this.mailer.enabled) return;
    const { emailNotifications } = await this.settings.get();
    if (!emailNotifications) return;
    await tx.emailOutbox.create({ data: { appointmentId, kind, toEmail, sequence } });
  }

  /** Procesa un lote de correos pendientes. Devuelve cuántos se enviaron. */
  async processQueue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      // Recupera envíos que quedaron a medias (p. ej. reinicio del servidor durante el envío)
      await this.prisma.$executeRaw`
        UPDATE email_outbox SET status = 'PENDIENTE'
        WHERE status = 'ENVIANDO' AND send_after < now() - interval '10 minutes'`;

      // Reserva el lote de forma atómica (varias instancias no envían el mismo correo)
      const claimed = await this.prisma.$queryRaw<{ id: number }[]>`
        UPDATE email_outbox SET status = 'ENVIANDO', attempts = attempts + 1, send_after = now()
        WHERE id IN (
          SELECT id FROM email_outbox
          WHERE status = 'PENDIENTE' AND send_after <= now()
          ORDER BY id LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id`;

      for (const { id } of claimed.sort((a, b) => a.id - b.id)) {
        if (await this.sendOne(id)) sent++;
      }
    } catch (err) {
      this.logger.error(`Error procesando la cola de correos: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
    return sent;
  }

  private async sendOne(id: number): Promise<boolean> {
    const row = await this.prisma.emailOutbox.findUniqueOrThrow({
      where: { id },
      include: { appointment: { include: { patient: true, doctor: true } } },
    });
    try {
      const s = await this.settings.get();
      const a = row.appointment;
      const date = fromDbDate(a.appointmentDate);
      const startTime = fromDbTime(a.startTime);
      const endTime = fromDbTime(a.endTime);
      const kind = row.kind as MailKind;
      const location = `${s.clinicName} — ${s.clinicLocation}`;
      const summary = `Cita — ${a.doctor.displayName}`;
      const data: MailData = {
        kind,
        appointmentId: a.id,
        patientName: a.patient.name,
        doctorName: a.doctor.displayName,
        date,
        startTime,
        endTime,
        clinicName: s.clinicName,
        clinicLocation: s.clinicLocation,
        cancelReason: a.cancelReason,
        googleCalendarUrl: kind === 'CANCELADA' ? null : googleCalendarUrl({ date, startTime, endTime, title: summary, location, tz: this.config.timezone }),
      };
      const ics = buildIcs({
        uid: `cita-${a.id}@citas.uets.edu.ec`,
        sequence: row.sequence,
        method: kind === 'CANCELADA' ? 'CANCEL' : 'REQUEST',
        start: this.clock.toInstant(date, startTime),
        end: this.clock.toInstant(date, endTime),
        summary,
        description: `Cita #${a.id} de 1 hora en ${s.clinicName}. Para cancelar o cambiar la cita, comuníquese con el consultorio.`,
        location,
        organizer: { email: extractAddress(this.mailer.from), name: s.clinicName },
        attendee: { email: row.toEmail, name: a.patient.name },
        alarmsMinutesBefore: REMINDERS_MINUTES,
      });
      await this.mailer.send({
        to: row.toEmail,
        subject: subjectFor(data),
        text: textFor(data),
        html: htmlFor(data),
        ical: { method: kind === 'CANCELADA' ? 'CANCEL' : 'REQUEST', content: ics },
      });
      await this.prisma.emailOutbox.update({ where: { id }, data: { status: 'ENVIADO', sentAt: new Date(), lastError: null } });
      return true;
    } catch (err) {
      const failed = row.attempts >= MAX_ATTEMPTS;
      const waitMin = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)];
      await this.prisma.emailOutbox.update({
        where: { id },
        data: {
          status: failed ? 'FALLIDO' : 'PENDIENTE',
          lastError: String((err as Error).message).slice(0, 500),
          sendAfter: new Date(Date.now() + waitMin * 60_000),
        },
      });
      this.logger.warn(`Correo #${id} (${row.kind}) falló (intento ${row.attempts}): ${(err as Error).message}`);
      return false;
    }
  }

  /** Correo de prueba desde Configuración (no usa la cola: responde de inmediato si funciona). */
  async sendTest(to: string): Promise<void> {
    const s = await this.settings.get();
    await this.mailer.send({
      to,
      subject: `Correo de prueba — ${s.clinicName}`,
      text: `El envío de correos del sistema de citas funciona correctamente.\n\nRemitente: ${this.mailer.from}`,
      html: `<p style="font-family:Arial,sans-serif">El envío de correos del sistema de citas <strong>funciona correctamente</strong>.</p><p style="font-family:Arial,sans-serif;color:#5a6b6b">Remitente: ${this.mailer.from}</p>`,
    });
  }

  async status(): Promise<{ configured: boolean; from: string | null; pending: number; failed: number; sentLast24h: number }> {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [pending, failed, sentLast24h] = await Promise.all([
      this.prisma.emailOutbox.count({ where: { status: { in: ['PENDIENTE', 'ENVIANDO'] } } }),
      this.prisma.emailOutbox.count({ where: { status: 'FALLIDO' } }),
      this.prisma.emailOutbox.count({ where: { status: 'ENVIADO', sentAt: { gte: since } } }),
    ]);
    return { configured: this.mailer.enabled, from: this.mailer.enabled ? this.mailer.from : null, pending, failed, sentLast24h };
  }
}

/** "Citas UETS <noreply@uets.edu.ec>" → "noreply@uets.edu.ec" */
export function extractAddress(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

export function googleCalendarUrl(a: { date: string; startTime: string; endTime: string; title: string; location: string; tz: string }): string {
  const stamp = (d: string, t: string) => `${d.replaceAll('-', '')}T${t.replace(':', '')}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: a.title,
    dates: `${stamp(a.date, a.startTime)}/${stamp(a.date, a.endTime)}`,
    ctz: a.tz,
    location: a.location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
