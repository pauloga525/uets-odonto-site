import { z } from 'zod';
import { APPOINTMENT_STATUSES, ROLES } from './enums';
import { HOUR_RE, TIME_RE, isValidDate, timeToMinutes } from './time';

export const dateSchema = z.string().refine(isValidDate, 'Fecha inválida (formato AAAA-MM-DD)');
export const hourSchema = z.string().regex(HOUR_RE, 'La hora debe estar en punto (HH:00)');
export const timeSchema = z.string().regex(TIME_RE, 'Hora inválida (HH:MM)');
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido (AAAA-MM)');

/* ---------- Citas ---------- */

export const slotRefSchema = z.object({
  date: dateSchema,
  startTime: hourSchema,
});
export type SlotRef = z.infer<typeof slotRefSchema>;

export const bookAppointmentSchema = slotRefSchema.extend({
  doctorId: z.coerce.number().int().positive().optional(),
  /** Solo DOCTOR/ADMIN: reservar a nombre de un paciente. */
  patientId: z.string().uuid().optional(),
});
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;

export const finishAppointmentSchema = z.object({
  observations: z.string().trim().max(5000, 'Máximo 5000 caracteres').default(''),
  followUp: slotRefSchema.optional(),
});
export type FinishAppointmentInput = z.infer<typeof finishAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export const followUpSchema = slotRefSchema;
export const rescheduleSchema = slotRefSchema;

export const appointmentQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  status: z
    .union([z.enum(APPOINTMENT_STATUSES as [string, ...string[]]), z.array(z.enum(APPOINTMENT_STATUSES as [string, ...string[]]))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  patientId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
  scope: z.enum(['upcoming', 'past', 'cancelled', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type AppointmentQuery = z.infer<typeof appointmentQuerySchema>;

/* ---------- Disponibilidad ---------- */

export const blockSchema = z
  .object({ startTime: hourSchema, endTime: hourSchema })
  .refine((b) => timeToMinutes(b.endTime) > timeToMinutes(b.startTime), {
    message: 'La hora final debe ser mayor a la inicial',
    path: ['endTime'],
  });

export const periodSchema = z
  .object({
    name: z.string().trim().min(1, 'Requerido').max(100),
    startDate: dateSchema,
    endDate: dateSchema,
    weekdays: z.array(z.number().int().min(1).max(7)).min(1, 'Seleccione al menos un día').transform((w) => [...new Set(w)].sort()),
    blocks: z.array(blockSchema).min(1, 'Agregue al menos un bloque horario'),
    active: z.boolean().default(true),
    doctorId: z.number().int().positive().optional(),
  })
  .refine((p) => p.endDate >= p.startDate, { message: 'La fecha final debe ser igual o posterior a la inicial', path: ['endDate'] })
  .refine(
    (p) => {
      const sorted = [...p.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
      return sorted.every((b, i) => i === 0 || b.startTime >= sorted[i - 1].endTime);
    },
    { message: 'Los bloques horarios no pueden superponerse', path: ['blocks'] },
  );
export type PeriodInput = z.infer<typeof periodSchema>;

export const exceptionSchema = z.object({
  date: dateSchema,
  reason: z.string().trim().max(200).optional(),
  doctorId: z.number().int().positive().optional(),
});
export type ExceptionInput = z.infer<typeof exceptionSchema>;

/* ---------- Usuarios / configuración / auth ---------- */

export const updateUserSchema = z
  .object({
    role: z.enum(ROLES as [string, ...string[]]).optional(),
    active: z.boolean().optional(),
    name: z.string().trim().min(1).max(150).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const settingsSchema = z.object({
  allowedDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Dominio inválido')),
  /** Correos que NO pueden ingresar aunque su dominio esté autorizado. `*` = cualquier texto (ej. `*.est@uets.edu.ec`). */
  blockedEmailPatterns: z.array(
    z.string().trim().toLowerCase().regex(/^[a-z0-9.*_+-]*@?[a-z0-9.*-]*$/, 'Patrón inválido (use letras, números, puntos y *)').min(2).max(120),
  ),
  bookingLeadMinutes: z.number().int().min(0).max(10080),
  maxActivePerPatient: z.number().int().min(1).max(20),
  /** Enviar al paciente correos con invitación de calendario (reserva, seguimiento, reprogramación, cancelación). */
  emailNotifications: z.boolean(),
  clinicName: z.string().trim().min(1).max(150),
  clinicLocation: z.string().trim().max(200),
});
export type AppSettings = z.infer<typeof settingsSchema>;

export const devLoginSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export const auditQuerySchema = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const userQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLES as [string, ...string[]]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const slotsQuerySchema = z.object({
  date: dateSchema,
  doctorId: z.coerce.number().int().positive().optional(),
});
export const calendarQuerySchema = z.object({
  month: monthSchema,
  doctorId: z.coerce.number().int().positive().optional(),
});
export const rangeQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  doctorId: z.coerce.number().int().positive().optional(),
});

export const timeRangeSchema = z.object({ from: timeSchema, to: timeSchema });
