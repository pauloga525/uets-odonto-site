export const Role = {
  ADMIN: 'ADMIN',
  DOCTOR: 'DOCTOR',
  PATIENT: 'PATIENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLES = Object.values(Role);

export const AppointmentStatus = {
  RESERVADA: 'RESERVADA',
  INICIADA: 'INICIADA',
  EN_PROCESO: 'EN_PROCESO',
  FINALIZADA: 'FINALIZADA',
  CANCELADA: 'CANCELADA',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];
export const APPOINTMENT_STATUSES = Object.values(AppointmentStatus);

/** Estados que ocupan un horario (todo excepto CANCELADA). */
export const ACTIVE_STATUSES: AppointmentStatus[] = ['RESERVADA', 'INICIADA', 'EN_PROCESO', 'FINALIZADA'];
/** Estados de una cita que aún no termina. */
export const OPEN_STATUSES: AppointmentStatus[] = ['RESERVADA', 'INICIADA', 'EN_PROCESO'];

export type AppointmentAction = 'start' | 'process' | 'finish' | 'cancel';

/** Máquina de estados: acción → estado origen permitido → estado destino. */
export const TRANSITIONS: Record<AppointmentAction, { from: AppointmentStatus[]; to: AppointmentStatus }> = {
  start: { from: ['RESERVADA'], to: 'INICIADA' },
  process: { from: ['INICIADA'], to: 'EN_PROCESO' },
  finish: { from: ['EN_PROCESO'], to: 'FINALIZADA' },
  cancel: { from: ['RESERVADA'], to: 'CANCELADA' },
};

export function canTransition(status: AppointmentStatus, action: AppointmentAction): boolean {
  return TRANSITIONS[action].from.includes(status);
}

/** Siguiente acción "principal" que el doctor puede ejecutar sobre una cita. */
export function nextDoctorAction(status: AppointmentStatus): Exclude<AppointmentAction, 'cancel'> | null {
  switch (status) {
    case 'RESERVADA':
      return 'start';
    case 'INICIADA':
      return 'process';
    case 'EN_PROCESO':
      return 'finish';
    default:
      return null;
  }
}

export const STATUS_META: Record<AppointmentStatus, { label: string; icon: string; tone: string }> = {
  RESERVADA: { label: 'Reservada', icon: 'event_available', tone: 'reserved' },
  INICIADA: { label: 'Iniciada', icon: 'play_circle', tone: 'started' },
  EN_PROCESO: { label: 'En proceso', icon: 'medical_services', tone: 'progress' },
  FINALIZADA: { label: 'Finalizada', icon: 'check_circle', tone: 'finished' },
  CANCELADA: { label: 'Cancelada', icon: 'cancel', tone: 'cancelled' },
};

export const ACTION_META: Record<Exclude<AppointmentAction, 'cancel'>, { label: string; icon: string }> = {
  start: { label: 'Iniciar atención', icon: 'play_arrow' },
  process: { label: 'Pasar a en proceso', icon: 'medical_services' },
  finish: { label: 'Finalizar atención', icon: 'task_alt' },
};
