import { nowInZone, parseDate } from '@odonto/shared';

export const CLINIC_TZ = 'America/Guayaquil';
const LOCALE = 'es-EC';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...opts });

const longFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const mediumFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const dayMonthFmt = fmt({ day: 'numeric', month: 'long' });
const monthFmt = fmt({ month: 'long', year: 'numeric' });
const weekdayFmt = fmt({ weekday: 'long' });
const shortFmt = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Miércoles, 14 de octubre de 2026" */
export const longDate = (d: string) => cap(longFmt.format(parseDate(d)));
/** "mié, 14 oct" */
export const mediumDate = (d: string) => mediumFmt.format(parseDate(d));
/** "14 de octubre" */
export const dayMonth = (d: string) => dayMonthFmt.format(parseDate(d));
/** "Octubre de 2026" */
export const monthLabel = (month: string) => cap(monthFmt.format(parseDate(`${month}-01`)));
/** "Miércoles" */
export const weekdayName = (d: string) => cap(weekdayFmt.format(parseDate(d)));
/** "14/10/2026" */
export const shortDate = (d: string) => shortFmt.format(parseDate(d));

export const today = () => nowInZone(CLINIC_TZ).date;
export const nowTime = () => nowInZone(CLINIC_TZ).time;

/** Texto relativo: "Hoy", "Mañana", "En 5 días". */
export function relativeDay(d: string): string {
  const diff = Math.round((parseDate(d).getTime() - parseDate(today()).getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff > 1) return `En ${diff} días`;
  return `Hace ${-diff} días`;
}

export function dateTimeLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: CLINIC_TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Descarga un archivo .ics para agregar la cita al calendario del paciente. */
export function downloadIcs(a: { id: number; date: string; startTime: string; endTime: string; title: string; location: string }): void {
  const stamp = (d: string, t: string) => `${d.replaceAll('-', '')}T${t.replace(':', '')}00`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UETS//Citas//ES',
    'BEGIN:VEVENT',
    `UID:cita-${a.id}@uets`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=${CLINIC_TZ}:${stamp(a.date, a.startTime)}`,
    `DTEND;TZID=${CLINIC_TZ}:${stamp(a.date, a.endTime)}`,
    `SUMMARY:${a.title}`,
    `LOCATION:${a.location}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio de cita',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cita-${a.date}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Enlace para crear el evento directamente en Google Calendar. */
export function googleCalendarUrl(a: { date: string; startTime: string; endTime: string; title: string; location: string }): string {
  const stamp = (d: string, t: string) => `${d.replaceAll('-', '')}T${t.replace(':', '')}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: a.title,
    dates: `${stamp(a.date, a.startTime)}/${stamp(a.date, a.endTime)}`,
    ctz: CLINIC_TZ,
    location: a.location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
