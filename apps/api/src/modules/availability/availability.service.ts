import { Injectable } from '@nestjs/common';
import { AvailabilityBlock, AvailabilityPeriod } from '@prisma/client';
import { ExceptionDto, ExceptionInput, OPEN_STATUSES, PeriodDto, PeriodInput, PreviewDto } from '@odonto/shared';
import { AuthUser, RequestContext } from '../../common/auth-context';
import { ClockService } from '../../common/clock.service';
import { fromDbDate, fromDbTime, toDbDate, toDbTime } from '../../common/db-time';
import { DomainException } from '../../common/domain.exception';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { generateSlots } from '../slots/slot-generator';
import { SlotsService } from '../slots/slots.service';

type PeriodWithBlocks = AvailabilityPeriod & { blocks: AvailabilityBlock[] };

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** El doctor solo gestiona su propia disponibilidad; el admin, la de cualquier doctor. */
  private async doctorFor(user: AuthUser, requested?: number): Promise<number> {
    if (user.role === 'DOCTOR') {
      if (!user.doctorId) throw DomainException.forbidden();
      return user.doctorId;
    }
    return this.slots.resolveDoctorId(requested);
  }

  private plain(p: PeriodWithBlocks) {
    return {
      startDate: fromDbDate(p.startDate),
      endDate: fromDbDate(p.endDate),
      weekdays: p.weekdays,
      blocks: p.blocks
        .map((b) => ({ id: b.id, startTime: fromDbTime(b.startTime), endTime: fromDbTime(b.endTime) }))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    };
  }

  async listPeriods(user: AuthUser, doctorId?: number): Promise<PeriodDto[]> {
    const docId = await this.doctorFor(user, doctorId);
    const [periods, exceptions] = await Promise.all([
      this.prisma.availabilityPeriod.findMany({ where: { doctorId: docId }, include: { blocks: true }, orderBy: { startDate: 'asc' } }),
      this.prisma.availabilityException.findMany({ where: { doctorId: docId } }),
    ]);
    const exSet = new Set(exceptions.map((e) => fromDbDate(e.date)));
    return Promise.all(
      periods.map(async (p) => {
        const plain = this.plain(p);
        const generated = generateSlots([plain], exSet, plain.startDate, plain.endDate);
        const bookedCount = await this.prisma.appointment.count({
          where: { doctorId: docId, status: { not: 'CANCELADA' }, appointmentDate: { gte: p.startDate, lte: p.endDate } },
        });
        return {
          id: p.id,
          doctorId: p.doctorId,
          name: p.name,
          active: p.active,
          ...plain,
          slotCount: [...generated.values()].reduce((n, t) => n + t.length, 0),
          bookedCount,
        };
      }),
    );
  }

  async preview(user: AuthUser, input: PeriodInput): Promise<PreviewDto> {
    const docId = await this.doctorFor(user, input.doctorId);
    const exceptions = await this.prisma.availabilityException.findMany({
      where: { doctorId: docId, date: { gte: toDbDate(input.startDate), lte: toDbDate(input.endDate) } },
    });
    const generated = generateSlots([input], new Set(exceptions.map((e) => fromDbDate(e.date))), input.startDate, input.endDate);
    const days = [...generated.entries()].map(([date, slots]) => ({ date, slots }));
    return { totalSlots: days.reduce((n, d) => n + d.slots.length, 0), days };
  }

  /**
   * Tras modificar la configuración (dentro de la transacción) verifica que ninguna cita futura
   * quede fuera de la disponibilidad. Si ocurre, la transacción se revierte.
   */
  private async assertNoOrphans(tx: Tx, doctorId: number, from: string, to: string): Promise<void> {
    const today = this.clock.now().date;
    const start = from > today ? from : today;
    if (start > to) return;
    const appts = await tx.appointment.findMany({
      where: { doctorId, status: { in: OPEN_STATUSES }, appointmentDate: { gte: toDbDate(start), lte: toDbDate(to) } },
      select: { id: true, appointmentDate: true, startTime: true, patient: { select: { name: true } } },
    });
    if (appts.length === 0) return;
    const configured = await this.slots.configuredSlots(doctorId, start, to, tx);
    const orphans = appts
      .map((a) => ({ id: a.id, date: fromDbDate(a.appointmentDate), startTime: fromDbTime(a.startTime), patient: a.patient.name }))
      .filter((a) => !configured.get(a.date)?.includes(a.startTime));
    if (orphans.length > 0) {
      throw DomainException.conflict(
        'AVAILABILITY_IN_USE',
        `El cambio dejaría ${orphans.length} cita(s) reservada(s) fuera de la disponibilidad. Reprograma o cancela esas citas primero.`,
        orphans,
      );
    }
  }

  private blocksData(input: PeriodInput) {
    return input.blocks.map((b) => ({ startTime: toDbTime(b.startTime), endTime: toDbTime(b.endTime) }));
  }

  async createPeriod(ctx: RequestContext, input: PeriodInput): Promise<PeriodDto> {
    const doctorId = await this.doctorFor(ctx.user, input.doctorId);
    const period = await this.prisma.$transaction(async (tx) => {
      const p = await tx.availabilityPeriod.create({
        data: {
          doctorId,
          name: input.name,
          startDate: toDbDate(input.startDate),
          endDate: toDbDate(input.endDate),
          weekdays: input.weekdays,
          active: input.active,
          blocks: { create: this.blocksData(input) },
        },
      });
      await this.audit.log(ctx, { action: 'CREAR_DISPONIBILIDAD', entity: 'availability_period', entityId: p.id, metadata: input }, tx);
      return p;
    });
    this.realtime.emitAgendaChanged(input.startDate);
    return (await this.listPeriods(ctx.user, doctorId)).find((p) => p.id === period.id)!;
  }

  async updatePeriod(ctx: RequestContext, id: number, input: PeriodInput): Promise<PeriodDto> {
    const existing = await this.getOwnedPeriod(ctx.user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.availabilityBlock.deleteMany({ where: { periodId: id } });
      await tx.availabilityPeriod.update({
        where: { id },
        data: {
          name: input.name,
          startDate: toDbDate(input.startDate),
          endDate: toDbDate(input.endDate),
          weekdays: input.weekdays,
          active: input.active,
          blocks: { create: this.blocksData(input) },
        },
      });
      const from = [fromDbDate(existing.startDate), input.startDate].sort()[0];
      const to = [fromDbDate(existing.endDate), input.endDate].sort()[1];
      await this.assertNoOrphans(tx, existing.doctorId, from, to);
      await this.audit.log(
        ctx,
        { action: 'ACTUALIZAR_DISPONIBILIDAD', entity: 'availability_period', entityId: id, metadata: { before: this.plain(existing), after: input } },
        tx,
      );
    });
    this.realtime.emitAgendaChanged(input.startDate);
    return (await this.listPeriods(ctx.user, existing.doctorId)).find((p) => p.id === id)!;
  }

  async deletePeriod(ctx: RequestContext, id: number): Promise<void> {
    const existing = await this.getOwnedPeriod(ctx.user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.availabilityPeriod.delete({ where: { id } });
      await this.assertNoOrphans(tx, existing.doctorId, fromDbDate(existing.startDate), fromDbDate(existing.endDate));
      await this.audit.log(ctx, { action: 'ELIMINAR_DISPONIBILIDAD', entity: 'availability_period', entityId: id, metadata: this.plain(existing) }, tx);
    });
    this.realtime.emitAgendaChanged(fromDbDate(existing.startDate));
  }

  private async getOwnedPeriod(user: AuthUser, id: number): Promise<PeriodWithBlocks> {
    const p = await this.prisma.availabilityPeriod.findUnique({ where: { id }, include: { blocks: true } });
    if (!p) throw DomainException.notFound('Período no encontrado');
    if (user.role === 'DOCTOR' && p.doctorId !== user.doctorId) throw DomainException.forbidden();
    return p;
  }

  /* ---------- Días no disponibles ---------- */

  async listExceptions(user: AuthUser, doctorId?: number): Promise<ExceptionDto[]> {
    const docId = await this.doctorFor(user, doctorId);
    const rows = await this.prisma.availabilityException.findMany({ where: { doctorId: docId }, orderBy: { date: 'asc' } });
    return rows.map((r) => ({ id: r.id, doctorId: r.doctorId, date: fromDbDate(r.date), reason: r.reason }));
  }

  async createException(ctx: RequestContext, input: ExceptionInput): Promise<ExceptionDto> {
    const doctorId = await this.doctorFor(ctx.user, input.doctorId);
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.availabilityException.create({ data: { doctorId, date: toDbDate(input.date), reason: input.reason } });
      await this.assertNoOrphans(tx, doctorId, input.date, input.date);
      await this.audit.log(ctx, { action: 'CREAR_DIA_NO_DISPONIBLE', entity: 'availability_exception', entityId: r.id, metadata: input }, tx);
      return r;
    });
    this.realtime.emitAgendaChanged(input.date);
    return { id: row.id, doctorId, date: input.date, reason: row.reason };
  }

  async deleteException(ctx: RequestContext, id: number): Promise<void> {
    const row = await this.prisma.availabilityException.findUnique({ where: { id } });
    if (!row) throw DomainException.notFound();
    if (ctx.user.role === 'DOCTOR' && row.doctorId !== ctx.user.doctorId) throw DomainException.forbidden();
    await this.prisma.availabilityException.delete({ where: { id } });
    await this.audit.log(ctx, { action: 'ELIMINAR_DIA_NO_DISPONIBLE', entity: 'availability_exception', entityId: id, metadata: { date: fromDbDate(row.date) } });
    this.realtime.emitAgendaChanged(fromDbDate(row.date));
  }
}
