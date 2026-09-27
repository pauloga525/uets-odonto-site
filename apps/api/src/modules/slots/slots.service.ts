import { Injectable } from '@nestjs/common';
import {
  ACTIVE_STATUSES,
  AppointmentStatus,
  CalendarDto,
  DaySlotsDto,
  Role,
  SlotDto,
  addMinutes,
  monthRange,
  slotEnd,
} from '@odonto/shared';
import { ClockService } from '../../common/clock.service';
import { fromDbDate, fromDbTime, toDbDate } from '../../common/db-time';
import { DomainException } from '../../common/domain.exception';
import { PrismaService, Tx } from '../../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PlainPeriod, generateSlots } from './slot-generator';

interface BookedInfo {
  id: number;
  status: AppointmentStatus;
  patientId: string;
  patientName: string;
}

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
  ) {}

  /** Doctor por defecto (inicialmente existe uno solo). */
  async resolveDoctorId(doctorId?: number): Promise<number> {
    const doctor = await this.prisma.doctor.findFirst({
      where: { active: true, ...(doctorId ? { id: doctorId } : {}) },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!doctor) throw DomainException.unprocessable('NO_DOCTOR');
    return doctor.id;
  }

  async loadConfig(doctorId: number, from: string, to: string, tx: Tx = this.prisma): Promise<{ periods: PlainPeriod[]; exceptions: Set<string> }> {
    const [periods, exceptions] = await Promise.all([
      tx.availabilityPeriod.findMany({
        where: { doctorId, active: true, startDate: { lte: toDbDate(to) }, endDate: { gte: toDbDate(from) } },
        include: { blocks: true },
      }),
      tx.availabilityException.findMany({
        where: { doctorId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      }),
    ]);
    return {
      periods: periods.map((p) => ({
        startDate: fromDbDate(p.startDate),
        endDate: fromDbDate(p.endDate),
        weekdays: p.weekdays,
        blocks: p.blocks.map((b) => ({ startTime: fromDbTime(b.startTime), endTime: fromDbTime(b.endTime) })),
      })),
      exceptions: new Set(exceptions.map((e) => fromDbDate(e.date))),
    };
  }

  async configuredSlots(doctorId: number, from: string, to: string, tx?: Tx): Promise<Map<string, string[]>> {
    const { periods, exceptions } = await this.loadConfig(doctorId, from, to, tx);
    return generateSlots(periods, exceptions, from, to);
  }

  private async bookedMap(doctorId: number, from: string, to: string): Promise<Map<string, BookedInfo>> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: ACTIVE_STATUSES },
        appointmentDate: { gte: toDbDate(from), lte: toDbDate(to) },
      },
      select: { id: true, status: true, appointmentDate: true, startTime: true, patientId: true, patient: { select: { name: true } } },
    });
    return new Map(
      rows.map((r) => [
        `${fromDbDate(r.appointmentDate)} ${fromDbTime(r.startTime)}`,
        { id: r.id, status: r.status as AppointmentStatus, patientId: r.patientId, patientName: r.patient.name },
      ]),
    );
  }

  /** Instante límite para reservar: ahora + antelación mínima (para staff no se aplica antelación). */
  private async cutoff(role: Role): Promise<{ date: string; time: string }> {
    if (role !== 'PATIENT') return this.clock.now();
    const { bookingLeadMinutes } = await this.settings.get();
    return this.clock.nowPlus(bookingLeadMinutes);
  }

  private isPast(date: string, startTime: string, cutoff: { date: string; time: string }): boolean {
    return date < cutoff.date || (date === cutoff.date && startTime < cutoff.time);
  }

  /** Disponibilidad de un día: configuración − citas activas − horarios pasados. */
  async daySlots(date: string, role: Role, doctorId?: number): Promise<DaySlotsDto> {
    const [day] = await this.rangeSlots(date, date, role, doctorId, true);
    return day;
  }

  /** Disponibilidad de un rango de fechas (agenda semanal/mensual del personal). */
  async rangeSlots(from: string, to: string, role: Role, doctorId?: number, includeEmpty = false): Promise<DaySlotsDto[]> {
    const docId = await this.resolveDoctorId(doctorId);
    const [configured, booked, cutoff] = await Promise.all([
      this.configuredSlots(docId, from, to),
      this.bookedMap(docId, from, to),
      this.cutoff(role),
    ]);
    const isStaff = role !== 'PATIENT';
    const dates = includeEmpty && !configured.has(from) ? [from, ...configured.keys()] : [...configured.keys()];
    return dates.map((date) => {
      const slots: SlotDto[] = [];
      for (const startTime of configured.get(date) ?? []) {
        const appt = booked.get(`${date} ${startTime}`);
        const past = this.isPast(date, startTime, cutoff);
        if (past && !appt && !isStaff) continue;
        slots.push({
          date,
          startTime,
          endTime: slotEnd(startTime),
          available: !appt && !past,
          past,
          ...(isStaff && appt ? { appointment: appt } : {}),
        });
      }
      return { date, doctorId: docId, slots };
    });
  }

  /** Resumen mensual para el calendario: total y disponibles por día. */
  async calendar(month: string, role: Role, doctorId?: number): Promise<CalendarDto> {
    const docId = await this.resolveDoctorId(doctorId);
    const { from, to } = monthRange(month);
    const [configured, booked, cutoff] = await Promise.all([
      this.configuredSlots(docId, from, to),
      this.bookedMap(docId, from, to),
      this.cutoff(role),
    ]);
    const days = [...configured.entries()].map(([date, times]) => ({
      date,
      total: times.length,
      available: times.filter((t) => !booked.has(`${date} ${t}`) && !this.isPast(date, t, cutoff)).length,
    }));
    return { month, doctorId: docId, days };
  }

  /** Primera fecha con disponibilidad (para abrir el calendario directamente en ese mes). */
  async nextAvailable(role: Role, doctorId?: number): Promise<{ date: string | null; lastDate: string | null }> {
    const docId = await this.resolveDoctorId(doctorId);
    const cutoff = await this.cutoff(role);
    const periods = await this.prisma.availabilityPeriod.findMany({
      where: { doctorId: docId, active: true, endDate: { gte: toDbDate(cutoff.date) } },
      select: { endDate: true },
    });
    if (periods.length === 0) return { date: null, lastDate: null };
    const lastDate = periods.map((p) => fromDbDate(p.endDate)).sort().at(-1)!;
    const [configured, booked] = await Promise.all([
      this.configuredSlots(docId, cutoff.date, lastDate),
      this.bookedMap(docId, cutoff.date, lastDate),
    ]);
    for (const [date, times] of configured) {
      if (times.some((t) => !booked.has(`${date} ${t}`) && !this.isPast(date, t, cutoff))) return { date, lastDate };
    }
    return { date: null, lastDate };
  }

  /**
   * Reglas 1–4: fecha dentro de un período habilitado, hora perteneciente a un bloque configurado,
   * duración de 1 hora y horario no pasado. La regla 5 (libre) la garantiza el índice único en BD.
   */
  async assertBookable(doctorId: number, date: string, startTime: string, role: Role, tx?: Tx): Promise<void> {
    const configured = await this.configuredSlots(doctorId, date, date, tx);
    if (!configured.get(date)?.includes(startTime)) throw DomainException.unprocessable('OUTSIDE_AVAILABILITY');
    const cutoff = await this.cutoff(role);
    if (this.isPast(date, startTime, cutoff)) throw DomainException.unprocessable('SLOT_IN_PAST');
  }

  endOf(startTime: string): string {
    return addMinutes(startTime, 60);
  }
}
