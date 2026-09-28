import { parseDate } from '@odonto/shared';

export type MailKind = 'RESERVADA' | 'SEGUIMIENTO' | 'REPROGRAMADA' | 'CANCELADA';

export interface MailData {
  kind: MailKind;
  appointmentId: number;
  patientName: string;
  doctorName: string;
  date: string;
  startTime: string;
  endTime: string;
  clinicName: string;
  clinicLocation: string;
  cancelReason: string | null;
  /** Enlace para agregar el evento en Google Calendar (no se usa al cancelar). */
  googleCalendarUrl: string | null;
}

const longDate = (d: string) => {
  const s = new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseDate(d));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COPY: Record<MailKind, { subject: string; title: string; intro: string; color: string }> = {
  RESERVADA: {
    subject: 'Cita reservada',
    title: '¡Su cita está reservada!',
    intro: 'Le confirmamos su cita en el consultorio.',
    color: '#006a6a',
  },
  SEGUIMIENTO: {
    subject: 'Nueva cita de seguimiento',
    title: 'Se registró una cita de seguimiento',
    intro: 'El doctor agendó una nueva cita de control para usted.',
    color: '#006a6a',
  },
  REPROGRAMADA: {
    subject: 'Su cita fue reprogramada',
    title: 'Su cita cambió de horario',
    intro: 'El consultorio reprogramó su cita. Estos son los nuevos datos:',
    color: '#0b5394',
  },
  CANCELADA: {
    subject: 'Cita cancelada',
    title: 'Su cita fue cancelada',
    intro: 'Le informamos que la siguiente cita fue cancelada por el consultorio.',
    color: '#8a2a2a',
  },
};

export function subjectFor(d: MailData): string {
  return `${COPY[d.kind].subject}: ${longDate(d.date)}, ${d.startTime}`;
}

export function textFor(d: MailData): string {
  const c = COPY[d.kind];
  return [
    `Hola ${d.patientName},`,
    '',
    c.intro,
    '',
    `Fecha:   ${longDate(d.date)}`,
    `Horario: ${d.startTime} – ${d.endTime} (1 hora)`,
    `Lugar:   ${d.clinicLocation}`,
    `Atiende: ${d.doctorName}`,
    ...(d.kind === 'CANCELADA' && d.cancelReason ? [`Motivo:  ${d.cancelReason}`] : []),
    '',
    d.kind === 'CANCELADA'
      ? 'Si desea una nueva cita, puede reservarla en el sistema de citas.'
      : 'Se adjunta la invitación de calendario, con recordatorios 1 día y 1 hora antes. Llegue 10 minutos antes.',
    ...(d.googleCalendarUrl ? ['', `Agregar a Google Calendar: ${d.googleCalendarUrl}`] : []),
    '',
    '—',
    `${d.clinicName}`,
    'Este correo se envía automáticamente. Para cancelar o cambiar su cita, comuníquese con el consultorio.',
  ].join('\n');
}

export function htmlFor(d: MailData): string {
  const c = COPY[d.kind];
  const cancelled = d.kind === 'CANCELADA';
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;color:#5a6b6b;width:90px;vertical-align:top">${label}</td><td style="padding:8px 0;font-weight:600;color:#1a2626">${value}</td></tr>`;
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f2f6f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f6;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d6e2e2">
    <tr><td style="background:${c.color};padding:24px 28px;color:#ffffff">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">${esc(d.clinicName)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px">${c.title}</div>
    </td></tr>
    <tr><td style="padding:24px 28px;color:#1a2626;font-size:15px;line-height:1.5">
      <p style="margin:0 0 12px">Hola <strong>${esc(d.patientName)}</strong>,</p>
      <p style="margin:0 0 16px">${c.intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3ecec;border-bottom:1px solid #e3ecec;margin-bottom:18px${cancelled ? ';text-decoration:line-through;text-decoration-color:#b0bcbc' : ''}">
        ${row('Fecha', esc(longDate(d.date)))}
        ${row('Horario', `${d.startTime} – ${d.endTime} <span style="font-weight:400;color:#5a6b6b">(1 hora)</span>`)}
        ${row('Lugar', esc(d.clinicLocation))}
        ${row('Atiende', esc(d.doctorName))}
      </table>
      ${cancelled && d.cancelReason ? `<p style="margin:0 0 16px"><strong>Motivo:</strong> ${esc(d.cancelReason)}</p>` : ''}
      ${
        cancelled
          ? '<p style="margin:0 0 8px">Si desea una nueva cita, puede reservarla en el sistema de citas.</p>'
          : `<p style="margin:0 0 18px">Adjuntamos la <strong>invitación de calendario</strong> con recordatorios <strong>1 día</strong> y <strong>1 hora</strong> antes. Por favor, llegue 10 minutos antes.</p>
             ${d.googleCalendarUrl ? `<p style="margin:0 0 8px"><a href="${esc(d.googleCalendarUrl)}" style="display:inline-block;background:#006a6a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:24px;font-weight:600">Agregar a Google Calendar</a></p>` : ''}`
      }
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f6fafa;color:#5a6b6b;font-size:12px;line-height:1.5;border-top:1px solid #e3ecec">
      Este correo se envía automáticamente. Para cancelar o cambiar su cita, comuníquese con el consultorio.
      Cita #${d.appointmentId}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
