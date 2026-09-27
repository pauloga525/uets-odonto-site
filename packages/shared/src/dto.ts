import type { AppointmentStatus, Role } from './enums';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  active: boolean;
  consentAt: string | null;
  doctorId: number | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface DoctorDto {
  id: number;
  displayName: string;
  specialty: string | null;
}

export interface SlotDto {
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
  /** El horario ya pasó (o está dentro de la antelación mínima). */
  past: boolean;
  /** Solo para DOCTOR/ADMIN. */
  appointment?: {
    id: number;
    status: AppointmentStatus;
    patientId: string;
    patientName: string;
  };
}

export interface DaySlotsDto {
  date: string;
  doctorId: number;
  slots: SlotDto[];
}

export interface CalendarDayDto {
  date: string;
  total: number;
  available: number;
}

export interface CalendarDto {
  month: string;
  doctorId: number;
  days: CalendarDayDto[];
}

export interface AppointmentDto {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  doctor: DoctorDto;
  patient: { id: string; name: string; email: string; avatarUrl: string | null };
  /** Solo visible para DOCTOR/ADMIN. */
  observations?: string | null;
  previousAppointmentId: number | null;
  followUpIds: number[];
  cancelReason: string | null;
  version: number;
  reservedAt: string;
  startedAt: string | null;
  inProgressAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  canCancel: boolean;
}

export interface FinishResultDto {
  appointment: AppointmentDto;
  followUp: AppointmentDto | null;
}

export interface PageDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PeriodDto {
  id: number;
  doctorId: number;
  name: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  blocks: { id?: number; startTime: string; endTime: string }[];
  active: boolean;
  slotCount: number;
  bookedCount: number;
}

export interface ExceptionDto {
  id: number;
  doctorId: number;
  date: string;
  reason: string | null;
}

export interface PreviewDto {
  totalSlots: number;
  days: { date: string; slots: string[] }[];
}

export interface StatsDto {
  today: { total: number; pending: number; inProgress: number; finished: number; cancelled: number };
  upcoming: number;
  finishedTotal: number;
  occupancy: { periodName: string | null; booked: number; total: number } | null;
}

export interface AuditLogDto {
  id: string;
  user: { id: string; name: string; email: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ApiErrorDto {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Evento WebSocket de cambio de disponibilidad (sin datos personales). */
export interface SlotChangedEvent {
  doctorId: number;
  date: string;
  startTime: string;
  available: boolean;
}
