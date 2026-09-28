import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AppSettings,
  AppointmentDto,
  AuditLogDto,
  BookAppointmentInput,
  CalendarDto,
  DaySlotsDto,
  DoctorDto,
  ExceptionDto,
  ExceptionInput,
  FinishAppointmentInput,
  FinishResultDto,
  PageDto,
  PeriodDto,
  PeriodInput,
  PreviewDto,
  SlotRef,
  StatsDto,
  UpdateUserInput,
  UserDto,
} from '@odonto/shared';
import { Observable } from 'rxjs';

export const API = '/api/v1';

export interface MailStatus {
  configured: boolean;
  from: string | null;
  pending: number;
  failed: number;
  sentLast24h: number;
}

type Params = Record<string, string | number | boolean | string[] | undefined | null>;

function toParams(p: Params = {}): HttpParams {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => (params = params.append(k, x)));
    else params = params.set(k, String(v));
  }
  return params;
}

/** Cliente HTTP tipado con los DTO compartidos con el backend. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /* Slots */
  calendar(month: string, doctorId?: number): Observable<CalendarDto> {
    return this.http.get<CalendarDto>(`${API}/slots/calendar`, { params: toParams({ month, doctorId }) });
  }
  daySlots(date: string, doctorId?: number): Observable<DaySlotsDto> {
    return this.http.get<DaySlotsDto>(`${API}/slots`, { params: toParams({ date, doctorId }) });
  }
  rangeSlots(from: string, to: string): Observable<DaySlotsDto[]> {
    return this.http.get<DaySlotsDto[]>(`${API}/slots/range`, { params: toParams({ from, to }) });
  }
  nextAvailable(): Observable<{ date: string | null; lastDate: string | null }> {
    return this.http.get<{ date: string | null; lastDate: string | null }>(`${API}/slots/next`);
  }
  doctors(): Observable<DoctorDto[]> {
    return this.http.get<DoctorDto[]>(`${API}/slots/doctors`);
  }

  /* Citas */
  appointments(q: Params): Observable<PageDto<AppointmentDto>> {
    return this.http.get<PageDto<AppointmentDto>>(`${API}/appointments`, { params: toParams(q) });
  }
  appointment(id: number): Observable<AppointmentDto> {
    return this.http.get<AppointmentDto>(`${API}/appointments/${id}`);
  }
  book(input: BookAppointmentInput): Observable<AppointmentDto> {
    return this.http.post<AppointmentDto>(`${API}/appointments`, input);
  }
  start(id: number): Observable<AppointmentDto> {
    return this.http.post<AppointmentDto>(`${API}/appointments/${id}/start`, {});
  }
  process(id: number): Observable<AppointmentDto> {
    return this.http.post<AppointmentDto>(`${API}/appointments/${id}/process`, {});
  }
  finish(id: number, input: FinishAppointmentInput): Observable<FinishResultDto> {
    return this.http.post<FinishResultDto>(`${API}/appointments/${id}/finish`, input);
  }
  cancel(id: number, reason?: string): Observable<AppointmentDto> {
    return this.http.post<AppointmentDto>(`${API}/appointments/${id}/cancel`, { reason });
  }
  followUp(id: number, slot: SlotRef): Observable<AppointmentDto> {
    return this.http.post<AppointmentDto>(`${API}/appointments/${id}/follow-up`, slot);
  }
  reschedule(id: number, slot: SlotRef): Observable<AppointmentDto> {
    return this.http.patch<AppointmentDto>(`${API}/appointments/${id}`, slot);
  }
  stats(): Observable<StatsDto> {
    return this.http.get<StatsDto>(`${API}/appointments/stats`);
  }
  history(patientId: string): Observable<{ patient: AppointmentDto['patient']; items: AppointmentDto[] }> {
    return this.http.get<{ patient: AppointmentDto['patient']; items: AppointmentDto[] }>(`${API}/patients/${patientId}/history`);
  }

  /* Disponibilidad */
  periods(): Observable<PeriodDto[]> {
    return this.http.get<PeriodDto[]>(`${API}/availability/periods`);
  }
  preview(input: PeriodInput): Observable<PreviewDto> {
    return this.http.post<PreviewDto>(`${API}/availability/preview`, input);
  }
  createPeriod(input: PeriodInput): Observable<PeriodDto> {
    return this.http.post<PeriodDto>(`${API}/availability/periods`, input);
  }
  updatePeriod(id: number, input: PeriodInput): Observable<PeriodDto> {
    return this.http.put<PeriodDto>(`${API}/availability/periods/${id}`, input);
  }
  deletePeriod(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/availability/periods/${id}`);
  }
  exceptions(): Observable<ExceptionDto[]> {
    return this.http.get<ExceptionDto[]>(`${API}/availability/exceptions`);
  }
  createException(input: ExceptionInput): Observable<ExceptionDto> {
    return this.http.post<ExceptionDto>(`${API}/availability/exceptions`, input);
  }
  deleteException(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/availability/exceptions/${id}`);
  }

  /* Usuarios, configuración, auditoría */
  users(q: Params): Observable<PageDto<UserDto>> {
    return this.http.get<PageDto<UserDto>>(`${API}/users`, { params: toParams(q) });
  }
  updateUser(id: string, input: UpdateUserInput): Observable<UserDto> {
    return this.http.patch<UserDto>(`${API}/users/${id}`, input);
  }
  settings(): Observable<AppSettings> {
    return this.http.get<AppSettings>(`${API}/settings`);
  }
  publicSettings(): Observable<{ clinicName: string; clinicLocation: string; allowedDomains: string[] }> {
    return this.http.get<{ clinicName: string; clinicLocation: string; allowedDomains: string[] }>(`${API}/settings/public`);
  }
  updateSettings(input: AppSettings): Observable<AppSettings> {
    return this.http.put<AppSettings>(`${API}/settings`, input);
  }
  mailStatus(): Observable<MailStatus> {
    return this.http.get<MailStatus>(`${API}/settings/mail-status`);
  }
  testEmail(): Observable<{ sentTo: string }> {
    return this.http.post<{ sentTo: string }>(`${API}/settings/test-email`, {});
  }
  audit(q: Params): Observable<PageDto<AuditLogDto>> {
    return this.http.get<PageDto<AuditLogDto>>(`${API}/audit`, { params: toParams(q) });
  }
}
