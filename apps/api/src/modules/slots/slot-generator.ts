import { SLOT_MINUTES, isoWeekday, listDates, minutesToTime, timeToMinutes } from '@odonto/shared';

export interface PlainPeriod {
  startDate: string;
  endDate: string;
  weekdays: number[];
  blocks: { startTime: string; endTime: string }[];
}

/**
 * Configuración → Generación de horarios.
 * Devuelve, por fecha, las horas de inicio de cada espacio de 1 hora configurado
 * (período × días habilitados × bloques horarios − días no disponibles).
 * Función pura: no depende de la base de datos.
 */
export function generateSlots(periods: PlainPeriod[], exceptions: Set<string>, from: string, to: string): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const p of periods) {
    const start = p.startDate > from ? p.startDate : from;
    const end = p.endDate < to ? p.endDate : to;
    if (start > end) continue;
    for (const date of listDates(start, end)) {
      if (exceptions.has(date) || !p.weekdays.includes(isoWeekday(date))) continue;
      for (const b of p.blocks) {
        const endMin = timeToMinutes(b.endTime);
        for (let m = timeToMinutes(b.startTime); m + SLOT_MINUTES <= endMin; m += SLOT_MINUTES) {
          if (!map.has(date)) map.set(date, new Set());
          map.get(date)!.add(minutesToTime(m));
        }
      }
    }
  }
  const out = new Map<string, string[]>();
  [...map.keys()].sort().forEach((d) => out.set(d, [...map.get(d)!].sort()));
  return out;
}

/** ¿El horario pertenece a la configuración? (reglas 1, 2 y 4) */
export function isConfiguredSlot(periods: PlainPeriod[], exceptions: Set<string>, date: string, startTime: string): boolean {
  return generateSlots(periods, exceptions, date, date).get(date)?.includes(startTime) ?? false;
}
