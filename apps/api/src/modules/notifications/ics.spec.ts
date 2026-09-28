import { buildIcs, foldLine, icsText } from './ics';
import { htmlFor, subjectFor, textFor } from './mail-templates';

const base = {
  uid: 'cita-7@citas.uets.edu.ec',
  sequence: 0,
  method: 'REQUEST' as const,
  // 15/10/2026 10:00–11:00 en Guayaquil (UTC-5)
  start: new Date('2026-10-15T15:00:00Z'),
  end: new Date('2026-10-15T16:00:00Z'),
  summary: 'Cita — Odontología UETS',
  description: 'Cita #7 de 1 hora',
  location: 'Consultorio UETS, planta baja',
  organizer: { email: 'noreply@uets.edu.ec', name: 'Consultorio UETS' },
  attendee: { email: 'ana.torres@uets.edu.ec', name: 'Ana Torres' },
  alarmsMinutesBefore: [1440, 60],
  stamp: new Date('2026-09-28T12:00:00Z'),
};

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('Invitación de calendario (iCalendar)', () => {
  it('genera una invitación REQUEST con hora UTC, organizador noreply y recordatorios 1 día y 1 hora antes', () => {
    const ics = unfold(buildIcs(base));
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('UID:cita-7@citas.uets.edu.ec');
    expect(ics).toContain('DTSTART:20261015T150000Z');
    expect(ics).toContain('DTEND:20261015T160000Z');
    expect(ics).toContain('ORGANIZER;CN="Consultorio UETS":mailto:noreply@uets.edu.ec');
    expect(ics).toContain('RSVP=FALSE:mailto:ana.torres@uets.edu.ec');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT1H');
    expect(ics).toContain('STATUS:CONFIRMED');
  });

  it('la cancelación usa el mismo UID, SEQUENCE mayor, METHOD:CANCEL y sin recordatorios', () => {
    const ics = unfold(buildIcs({ ...base, method: 'CANCEL', sequence: 2 }));
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('UID:cita-7@citas.uets.edu.ec');
    expect(ics).toContain('SEQUENCE:2');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).not.toContain('VALARM');
  });

  it('escapa comas, punto y coma y saltos de línea', () => {
    expect(icsText('a, b; c\nd')).toBe('a\\, b\\; c\\nd');
    expect(unfold(buildIcs(base))).toContain('LOCATION:Consultorio UETS\\, planta baja');
  });

  it('pliega las líneas largas a 75 octetos sin romper caracteres acentuados', () => {
    const long = `DESCRIPTION:${'Atención odontológica '.repeat(10)}`;
    const folded = foldLine(long);
    for (const l of folded.split('\r\n')) expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });

  it('usa CRLF como separador de líneas', () => {
    const ics = buildIcs(base);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('Plantillas de correo', () => {
  const data = {
    kind: 'RESERVADA' as const,
    appointmentId: 7,
    patientName: 'Ana <Torres>',
    doctorName: 'Odontología UETS',
    date: '2026-10-15',
    startTime: '10:00',
    endTime: '11:00',
    clinicName: 'Consultorio UETS',
    clinicLocation: 'Planta baja',
    cancelReason: null,
    googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
  };

  it('arma el asunto con la fecha en español y la hora', () => {
    expect(subjectFor(data)).toBe('Cita reservada: Jueves, 15 de octubre de 2026, 10:00');
    expect(subjectFor({ ...data, kind: 'CANCELADA' })).toBe('Cita cancelada: Jueves, 15 de octubre de 2026, 10:00');
  });

  it('escapa el HTML de los datos y muestra el aviso de correo automático', () => {
    const html = htmlFor(data);
    expect(html).toContain('Ana &lt;Torres&gt;');
    expect(html).not.toContain('Ana <Torres>');
    expect(html).toContain('Agregar a Google Calendar');
    expect(textFor(data)).toContain('comuníquese con el consultorio');
  });

  it('en la cancelación muestra el motivo y no ofrece agregar al calendario', () => {
    const html = htmlFor({ ...data, kind: 'CANCELADA', cancelReason: 'Doctor en capacitación', googleCalendarUrl: null });
    expect(html).toContain('Doctor en capacitación');
    expect(html).not.toContain('Agregar a Google Calendar');
  });
});
