import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AppointmentAction,
  AppointmentDto,
  AppointmentQuery,
  AppointmentStatus,
  BookAppointmentInput,
  FinishAppointmentInput,
  FinishResultDto,
  OPEN_STATUSES,
  PageDto,
  SlotRef,
  StatsDto,
  TRANSITIONS,
  slotEnd,
} from '@odonto/shared';
import { AuthUser, RequestContext } from '../../common/auth-context';
import { ClockService } from '../../common/clock.service';
import { CryptoService } from '../../common/crypto.service';
import { fromDbDate, fromDbTime, toDbDate, toDbTime } from '../../common/db-time';
import { DomainException } from '../../common/domain.exception';
import { PrismaService, Tx, isUniqueViolation } from '../../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { generateSlots } from '../slots/slot-generator';
import { SlotsService } from '../slots/slots.service';

const INCLUDE = {
  patient: { select: { id: true, name: true, email: true, avatarUrl: true } },
  doctor: { select: { id: true, displayName: true, specialty: true } },
  followUps: { select: { id: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof INCLUDE }>;

const TIMESTAMP_FIELD: Record<AppointmentAction, keyof Prisma.AppointmentUpdateManyMutationInput> = {
  start: 'startedAt',
  process: 'inProgressAt',
  finish: 'finishedAt',
  cancel: 'cancelledAt',
};

const ACTION_AUDIT: Record<AppointmentAction, string> = {
  start: 'INICIAR_CITA',
  process: 'CITA_EN_PROCESO',
  finish: 'FINALIZAR_CITA',
  cancel: 'CANCELAR_CITA',
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Mapeo y autorización                                                */
  /* ------------------------------------------------------------------ */

  private isStaff(u: AuthUser) {
    return u.role === 'ADMIN' || u.role === 'DOCTOR';
  }

  /** Política: solo el doctor o el administrador cancelan citas, y únicamente si están RESERVADAS. */
  private canCancel(a: AppointmentRow, viewer: AuthUser): boolean {
    return a.status === 'RESERVADA' && this.isStaff(viewer);
  }

  toDto(a: AppointmentRow, viewer: AuthUser): AppointmentDto {
    return {
      id: a.id,
      date: fromDbDate(a.appointmentDate),
      startTime: fromDbTime(a.startTime),
      endTime: fromDbTime(a.endTime),
      status: a.status as AppointmentStatus,
      doctor: a.doctor,
      patient: a.patient,
      ...(this.isStaff(viewer) ? { observations: this.crypto.decrypt(a.observations) } : {}),
      previousAppointmentId: a.previousAppointmentId,
      followUpIds: a.followUps.map((f) => f.id),
      cancelReason: a.cancelReason,
      version: a.version,
      reservedAt: a.reservedAt.toISOString(),
      startedAt: a.startedAt?.toISOString() ?? null,
      inProgressAt: a.inProgressAt?.toISOString() ?? null,
      finishedAt: a.finishedAt?.toISOString() ?? null,
      cancelledAt: a.cancelledAt?.toISOString() ?? null,
      canCancel: this.canCancel(a, viewer),
    };
  }

  /** Autorización a nivel de recurso. */
  private assertAccess(a: { patientId: string; doctorId: number }, viewer: AuthUser) {
    if (viewer.role === 'ADMIN') return;
    if (viewer.role === 'DOCTOR' && a.doctorId === viewer.doctorId) return;
    if (viewer.role === 'PATIENT' && a.patientId === viewer.id) return;
    throw DomainException.notFound('Cita no encontrada');
  }

  private async load(id: number, viewer: AuthUser, tx: Tx = this.prisma): Promise<AppointmentRow> {
    const a = await tx.appointment.findUnique({ where: { id }, include: INCLUDE });
    if (!a) throw DomainException.notFound('Cita no encontrada');
    this.assertAccess(a, viewer);
    return a;
  }

  /* ------------------------------------------------------------------ */
  /* Consultas                                                           */
  /* ------------------------------------------------------------------ */

  async list(viewer: AuthUser, q: AppointmentQuery): Promise<PageDto<AppointmentDto>> {
    const today = toDbDate(this.clock.now().date);
    const where: Prisma.AppointmentWhereInput = {};
    if (viewer.role === 'PATIENT') where.patientId = viewer.id;
    if (viewer.role === 'DOCTOR') where.doctorId = viewer.doctorId ?? -1;
    if (q.patientId && this.isStaff(viewer)) where.patientId = q.patientId;

    const dateFilter: Prisma.DateTimeFilter = {};
    if (q.from) dateFilter.gte = toDbDate(q.from);
    if (q.to) dateFilter.lte = toDbDate(q.to);

    let orderDir: Prisma.SortOrder = 'asc';
    switch (q.scope) {
      case 'upcoming':
        where.status = { in: OPEN_STATUSES };
        dateFilter.gte = dateFilter.gte && dateFilter.gte > today ? dateFilter.gte : today;
        break;
      case 'past':
        where.OR = [{ status: 'FINALIZADA' }, { status: { in: OPEN_STATUSES }, appointmentDate: { lt: today } }];
        orderDir = 'desc';
        break;
      case 'cancelled':
        where.status = 'CANCELADA';
        orderDir = 'desc';
        break;
    }
    if (q.status) where.status = { in: q.status as AppointmentStatus[] };
    if (Object.keys(dateFilter).length) where.appointmentDate = dateFilter;
    if (q.search && this.isStaff(viewer)) {
      where.patient = {
        OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }],
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ appointmentDate: orderDir }, { startTime: orderDir }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: rows.map((r) => this.toDto(r, viewer)) };
  }

  async get(viewer: AuthUser, id: number): Promise<AppointmentDto> {
    return this.toDto(await this.load(id, viewer), viewer);
  }

  /** Historial completo de un paciente (doctor/admin). */
  async history(viewer: AuthUser, patientId: string): Promise<{ patient: AppointmentDto['patient']; items: AppointmentDto[] }> {
    const patient = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    if (!patient) throw DomainException.notFound('Paciente no encontrado');
    const rows = await this.prisma.appointment.findMany({
      where: { patientId, ...(viewer.role === 'DOCTOR' ? { doctorId: viewer.doctorId ?? -1 } : {}) },
      include: INCLUDE,
      orderBy: [{ appointmentDate: 'desc' }, { startTime: 'desc' }],
    });
    return { patient, items: rows.map((r) => this.toDto(r, viewer)) };
  }

  /* ------------------------------------------------------------------ */
  /* Reserva (control de doble reserva)                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Inserta la cita dentro de la transacción. El índice único parcial
   * `uq_appt_slot_active (doctor_id, appointment_date, start_time) WHERE status <> 'CANCELADA'`
   * es la barrera definitiva: si dos usuarios confirman a la vez, solo un INSERT prospera.
   */
  private async insertAppointment(
    tx: Tx,
    data: { doctorId: number; patientId: string; slot: SlotRef; createdById: string; previousAppointmentId?: number },
  ) {
    try {
      return await tx.appointment.create({
        data: {
          doctorId: data.doctorId,
          patientId: data.patientId,
          appointmentDate: toDbDate(data.slot.date),
          startTime: toDbTime(data.slot.startTime),
          endTime: toDbTime(slotEnd(data.slot.startTime)),
          createdById: data.createdById,
          previousAppointmentId: data.previousAppointmentId ?? null,
        },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  private mapUniqueError(err: unknown): unknown {
    if (!isUniqueViolation(err)) return err;
    const info = JSON.stringify((err as Prisma.PrismaClientKnownRequestError).meta ?? {}) + String((err as Error).message);
    if (info.includes('uq_appt_patient_slot_active') || info.includes('patient_id')) {
      return DomainException.conflict('PATIENT_SLOT_CONFLICT');
    }
    return DomainException.conflict('SLOT_TAKEN');
  }

  async book(ctx: RequestContext, input: BookAppointmentInput): Promise<AppointmentDto> {
    const viewer = ctx.user;
    let patientId = viewer.id;
    let patientEmail = viewer.email;
    if (this.isStaff(viewer)) {
      if (!input.patientId) throw DomainException.unprocessable('VALIDATION', 'Seleccione el paciente para la cita.');
      const p = await this.prisma.user.findUnique({ where: { id: input.patientId } });
      if (!p || !p.active) throw DomainException.notFound('Paciente no encontrado');
      patientId = p.id;
      patientEmail = p.email;
    }
    const doctorId = viewer.role === 'DOCTOR' ? viewer.doctorId! : await this.slots.resolveDoctorId(input.doctorId);

    // Validación de backend: nunca se confía en lo que el frontend mostró como "disponible".
    await this.slots.assertBookable(doctorId, input.date, input.startTime, viewer.role);
    const s = await this.settings.get();

    const created = await this.prisma.$transaction(async (tx) => {
      if (viewer.role === 'PATIENT') {
        // Serializa las reservas del mismo paciente para aplicar el límite de citas activas sin carreras.
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${patientId}))) AS l`;
        const active = await tx.appointment.count({
          where: { patientId, status: { in: OPEN_STATUSES }, appointmentDate: { gte: toDbDate(this.clock.now().date) } },
        });
        if (active >= s.maxActivePerPatient) throw DomainException.conflict('ACTIVE_LIMIT');
      }
      const a = await this.insertAppointment(tx, { doctorId, patientId, slot: input, createdById: viewer.id });
      await this.audit.log(ctx, { action: 'RESERVAR_CITA', entity: 'appointment', entityId: a.id, toStatus: 'RESERVADA', metadata: { date: input.date, startTime: input.startTime } }, tx);
      await this.notifications.enqueue(tx, a.id, 'RESERVADA', patientEmail, a.version);
      return a;
    });

    this.realtime.emitSlotChanged({ doctorId, date: input.date, startTime: input.startTime, available: false });
    return this.get(viewer, created.id);
  }

  /* ------------------------------------------------------------------ */
  /* Ciclo de vida                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Transición con bloqueo optimista: el UPDATE solo aplica si el estado y la versión
   * no cambiaron desde que se leyó (evita que dos pestañas/usuarios se pisen).
   */
  private async applyTransition(
    tx: Tx,
    ctx: RequestContext,
    a: AppointmentRow,
    action: AppointmentAction,
    extra: Prisma.AppointmentUpdateManyMutationInput = {},
  ) {
    const t = TRANSITIONS[action];
    if (!t.from.includes(a.status as AppointmentStatus)) throw DomainException.conflict('INVALID_TRANSITION');
    const res = await tx.appointment.updateMany({
      where: { id: a.id, status: a.status, version: a.version },
      data: { ...extra, status: t.to, version: { increment: 1 }, [TIMESTAMP_FIELD[action]]: new Date() },
    });
    if (res.count !== 1) throw DomainException.conflict('CONCURRENT_UPDATE');
    await this.audit.log(ctx, { action: ACTION_AUDIT[action], entity: 'appointment', entityId: a.id, fromStatus: a.status, toStatus: t.to }, tx);
  }

  async transition(ctx: RequestContext, id: number, action: 'start' | 'process'): Promise<AppointmentDto> {
    if (ctx.user.role === 'PATIENT') throw DomainException.forbidden();
    const a = await this.load(id, ctx.user);
    await this.prisma.$transaction((tx) => this.applyTransition(tx, ctx, a, action));
    this.realtime.emitAgendaChanged(fromDbDate(a.appointmentDate));
    return this.get(ctx.user, id);
  }

  async cancel(ctx: RequestContext, id: number, reason?: string): Promise<AppointmentDto> {
    if (ctx.user.role === 'PATIENT') throw DomainException.forbidden('Para cancelar tu cita, comunícate con el consultorio.');
    const a = await this.load(id, ctx.user);
    await this.prisma.$transaction(async (tx) => {
      await this.applyTransition(tx, ctx, a, 'cancel', { cancelReason: reason ?? null });
      // La cancelación elimina el evento del calendario del paciente (mismo UID, SEQUENCE mayor)
      await this.notifications.enqueue(tx, a.id, 'CANCELADA', a.patient.email, a.version + 1);
    });
    this.realtime.emitSlotChanged({
      doctorId: a.doctorId,
      date: fromDbDate(a.appointmentDate),
      startTime: fromDbTime(a.startTime),
      available: true,
    });
    return this.get(ctx.user, id);
  }

  /** Finaliza la atención con observaciones y, opcionalmente, crea la cita de seguimiento en la misma transacción. */
  async finish(ctx: RequestContext, id: number, input: FinishAppointmentInput): Promise<FinishResultDto> {
    if (ctx.user.role === 'PATIENT') throw DomainException.forbidden();
    const a = await this.load(id, ctx.user);
    if (input.followUp) await this.slots.assertBookable(a.doctorId, input.followUp.date, input.followUp.startTime, ctx.user.role);

    const followUpId = await this.prisma.$transaction(async (tx) => {
      await this.applyTransition(tx, ctx, a, 'finish', { observations: this.crypto.encrypt(input.observations) });
      if (!input.followUp) return null;
      const f = await this.insertAppointment(tx, {
        doctorId: a.doctorId,
        patientId: a.patientId,
        slot: input.followUp,
        createdById: ctx.user.id,
        previousAppointmentId: a.id,
      });
      await this.audit.log(ctx, { action: 'CREAR_SEGUIMIENTO', entity: 'appointment', entityId: f.id, toStatus: 'RESERVADA', metadata: { previousAppointmentId: a.id } }, tx);
      await this.notifications.enqueue(tx, f.id, 'SEGUIMIENTO', a.patient.email, f.version);
      return f.id;
    });

    this.realtime.emitAgendaChanged(fromDbDate(a.appointmentDate));
    if (input.followUp) this.realtime.emitSlotChanged({ doctorId: a.doctorId, ...input.followUp, available: false });
    return {
      appointment: await this.get(ctx.user, id),
      followUp: followUpId ? await this.get(ctx.user, followUpId) : null,
    };
  }

  /** Cita de seguimiento posterior a la atención. */
  async followUp(ctx: RequestContext, id: number, slot: SlotRef): Promise<AppointmentDto> {
    if (ctx.user.role === 'PATIENT') throw DomainException.forbidden();
    const a = await this.load(id, ctx.user);
    if (a.status !== 'FINALIZADA' && a.status !== 'EN_PROCESO') throw DomainException.unprocessable('FOLLOW_UP_NOT_ALLOWED');
    await this.slots.assertBookable(a.doctorId, slot.date, slot.startTime, ctx.user.role);
    const f = await this.prisma.$transaction(async (tx) => {
      const created = await this.insertAppointment(tx, {
        doctorId: a.doctorId,
        patientId: a.patientId,
        slot,
        createdById: ctx.user.id,
        previousAppointmentId: a.id,
      });
      await this.audit.log(ctx, { action: 'CREAR_SEGUIMIENTO', entity: 'appointment', entityId: created.id, toStatus: 'RESERVADA', metadata: { previousAppointmentId: a.id } }, tx);
      await this.notifications.enqueue(tx, created.id, 'SEGUIMIENTO', a.patient.email, created.version);
      return created;
    });
    this.realtime.emitSlotChanged({ doctorId: a.doctorId, ...slot, available: false });
    return this.get(ctx.user, f.id);
  }

  /** Reprogramación (admin/doctor) de una cita RESERVADA a otro horario disponible. */
  async reschedule(ctx: RequestContext, id: number, slot: SlotRef): Promise<AppointmentDto> {
    if (ctx.user.role === 'PATIENT') throw DomainException.forbidden();
    const a = await this.load(id, ctx.user);
    if (a.status !== 'RESERVADA') throw DomainException.conflict('INVALID_TRANSITION');
    await this.slots.assertBookable(a.doctorId, slot.date, slot.startTime, ctx.user.role);
    const old = { date: fromDbDate(a.appointmentDate), startTime: fromDbTime(a.startTime) };
    await this.prisma.$transaction(async (tx) => {
      try {
        const res = await tx.appointment.updateMany({
          where: { id, status: 'RESERVADA', version: a.version },
          data: {
            appointmentDate: toDbDate(slot.date),
            startTime: toDbTime(slot.startTime),
            endTime: toDbTime(slotEnd(slot.startTime)),
            version: { increment: 1 },
          },
        });
        if (res.count !== 1) throw DomainException.conflict('CONCURRENT_UPDATE');
      } catch (err) {
        throw this.mapUniqueError(err);
      }
      await this.audit.log(ctx, { action: 'REPROGRAMAR_CITA', entity: 'appointment', entityId: id, metadata: { from: old, to: slot } }, tx);
      // Actualiza el evento existente en el calendario del paciente (mismo UID, SEQUENCE mayor)
      await this.notifications.enqueue(tx, id, 'REPROGRAMADA', a.patient.email, a.version + 1);
    });
    this.realtime.emitSlotChanged({ doctorId: a.doctorId, ...old, available: true });
    this.realtime.emitSlotChanged({ doctorId: a.doctorId, ...slot, available: false });
    return this.get(ctx.user, id);
  }

  /* ------------------------------------------------------------------ */
  /* Indicadores para dashboards                                         */
  /* ------------------------------------------------------------------ */

  async stats(viewer: AuthUser): Promise<StatsDto> {
    const doctorId = viewer.role === 'DOCTOR' ? viewer.doctorId! : await this.slots.resolveDoctorId();
    const today = this.clock.now().date;
    const base = { doctorId };
    const [todayRows, upcoming, finishedTotal] = await Promise.all([
      this.prisma.appointment.groupBy({ by: ['status'], where: { ...base, appointmentDate: toDbDate(today) }, _count: true }),
      this.prisma.appointment.count({ where: { ...base, status: 'RESERVADA', appointmentDate: { gte: toDbDate(today) } } }),
      this.prisma.appointment.count({ where: { ...base, status: 'FINALIZADA' } }),
    ]);
    const count = (s: AppointmentStatus) => todayRows.find((r) => r.status === s)?._count ?? 0;

    const period = await this.prisma.availabilityPeriod.findFirst({
      where: { doctorId, active: true, endDate: { gte: toDbDate(today) } },
      orderBy: { startDate: 'asc' },
      include: { blocks: true },
    });
    let occupancy: StatsDto['occupancy'] = null;
    if (period) {
      const from = fromDbDate(period.startDate);
      const to = fromDbDate(period.endDate);
      const exceptions = await this.prisma.availabilityException.findMany({ where: { doctorId, date: { gte: period.startDate, lte: period.endDate } } });
      const generated = generateSlots(
        [{ startDate: from, endDate: to, weekdays: period.weekdays, blocks: period.blocks.map((b) => ({ startTime: fromDbTime(b.startTime), endTime: fromDbTime(b.endTime) })) }],
        new Set(exceptions.map((e) => fromDbDate(e.date))),
        from,
        to,
      );
      const booked = await this.prisma.appointment.count({
        where: { doctorId, status: { not: 'CANCELADA' }, appointmentDate: { gte: period.startDate, lte: period.endDate } },
      });
      occupancy = { periodName: period.name, booked, total: [...generated.values()].reduce((n, t) => n + t.length, 0) };
    }

    return {
      today: {
        total: todayRows.reduce((n, r) => n + r._count, 0),
        pending: count('RESERVADA'),
        inProgress: count('INICIADA') + count('EN_PROCESO'),
        finished: count('FINALIZADA'),
        cancelled: count('CANCELADA'),
      },
      upcoming,
      finishedTotal,
      occupancy,
    };
  }
}
