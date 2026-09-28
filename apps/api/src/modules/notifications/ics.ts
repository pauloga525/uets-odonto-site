/**
 * Invitaciones de calendario (iCalendar, RFC 5545) compatibles con Google Calendar y Outlook.
 * Mismo UID por cita + SEQUENCE creciente: las reprogramaciones y cancelaciones actualizan
 * o eliminan el evento que el paciente ya agregó.
 */

export interface IcsEvent {
  uid: string;
  sequence: number;
  method: 'REQUEST' | 'CANCEL';
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location: string;
  organizer: { email: string; name: string };
  attendee: { email: string; name: string };
  /** Minutos antes del inicio en que se muestra cada recordatorio. */
  alarmsMinutesBefore: number[];
  stamp?: Date;
}

/** 2026-10-15T15:00:00Z → 20261015T150000Z */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escapa texto según RFC 5545 (\ ; , y saltos de línea). */
export function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Parámetro entre comillas (CN="…"): las comillas no se permiten dentro. */
function icsParam(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

/** Pliega líneas a 75 octetos (los caracteres UTF-8 multibyte no se cortan). */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // las continuaciones empiezan con un espacio
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

function alarm(minutes: number, summary: string): string[] {
  const trigger = minutes % 1440 === 0 ? `-P${minutes / 1440}D` : minutes % 60 === 0 ? `-PT${minutes / 60}H` : `-PT${minutes}M`;
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(summary)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

export function buildIcs(e: IcsEvent): string {
  const cancelled = e.method === 'CANCEL';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UETS//Sistema de Citas//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.method}`,
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${icsDate(e.stamp ?? new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsText(e.summary)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    `LOCATION:${icsText(e.location)}`,
    `ORGANIZER;CN=${icsParam(e.organizer.name)}:mailto:${e.organizer.email}`,
    // RSVP=FALSE: no se pide confirmación (evita respuestas automáticas a la cuenta noreply)
    `ATTENDEE;CN=${icsParam(e.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancelled ? 'DECLINED' : 'ACCEPTED'};RSVP=FALSE:mailto:${e.attendee.email}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    ...(cancelled ? [] : e.alarmsMinutesBefore.flatMap((m) => alarm(m, e.summary))),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
