/**
 * Utilidades de fecha/hora basadas en cadenas:
 *   fecha  → 'YYYY-MM-DD'
 *   hora   → 'HH:MM'
 * Evitan problemas de zona horaria: el negocio opera en una sola zona (America/Guayaquil).
 */

export const SLOT_MINUTES = 60;

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const HOUR_RE = /^([01]\d|2[0-3]):00$/;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

export function slotEnd(startTime: string): string {
  return addMinutes(startTime, SLOT_MINUTES);
}

/** Parsea 'YYYY-MM-DD' como fecha UTC a medianoche (sin corrimientos de zona). */
export function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

/** Día ISO de la semana: 1 = lunes … 7 = domingo. */
export function isoWeekday(date: string): number {
  const wd = parseDate(date).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Lista inclusiva de fechas entre `from` y `to`. */
export function listDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  return formatDate(parseDate(date)) === date;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * ¿El correo coincide con el patrón? `*` representa cualquier texto; sin distinguir mayúsculas.
 * Ej.: `*.est@uets.edu.ec` coincide con `juan.perez.est@uets.edu.ec` pero no con `juan.perez@uets.edu.ec`.
 */
export function matchesEmailPattern(email: string, pattern: string): boolean {
  const re = pattern
    .trim()
    .toLowerCase()
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\-]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${re}$`).test(email.trim().toLowerCase());
}

/** Fecha y hora "de pared" actuales en una zona horaria IANA. */
export function nowInZone(timeZone: string, instant: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
