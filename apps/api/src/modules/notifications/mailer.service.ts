import { Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config';

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Invitación iCalendar: Gmail/Outlook la muestran como evento con "Agregar al calendario". */
  ical?: { method: 'REQUEST' | 'CANCEL'; content: string };
}

/** Envío SMTP (Gmail con la cuenta noreply). Se reemplaza por un doble en las pruebas. */
@Injectable()
export class MailerService {
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.mail.configured;
  }

  get from(): string {
    return this.config.mail.from;
  }

  private transport(): Transporter {
    this.transporter ??= nodemailer.createTransport({
      host: this.config.mail.host,
      port: this.config.mail.port,
      secure: this.config.mail.port === 465,
      auth: this.config.mail.user ? { user: this.config.mail.user, pass: this.config.mail.pass } : undefined,
      requireTLS: this.config.mail.port !== 465,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    return this.transporter;
  }

  async send(mail: OutgoingMail): Promise<void> {
    await this.transport().sendMail({
      from: this.config.mail.from,
      to: mail.to,
      replyTo: this.config.mail.replyTo || undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.ical
        ? { icalEvent: { method: mail.ical.method, filename: mail.ical.method === 'CANCEL' ? 'cancelacion.ics' : 'invitacion.ics', content: mail.ical.content } }
        : {}),
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    });
  }
}
