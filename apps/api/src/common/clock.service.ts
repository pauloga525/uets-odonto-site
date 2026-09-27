import { Injectable } from '@nestjs/common';
import { nowInZone } from '@odonto/shared';
import { AppConfig } from '../config/app-config';

/** Reloj inyectable (permite fijar "ahora" en pruebas). */
@Injectable()
export class ClockService {
  constructor(private readonly config: AppConfig) {}

  instant(): Date {
    return new Date();
  }

  /** Fecha/hora local de la clínica. */
  now(): { date: string; time: string } {
    return nowInZone(this.config.timezone, this.instant());
  }

  /** Fecha/hora local dentro de `minutes` minutos. */
  nowPlus(minutes: number): { date: string; time: string } {
    return nowInZone(this.config.timezone, new Date(this.instant().getTime() + minutes * 60_000));
  }

  /**
   * Instante UTC de una fecha/hora local de la clínica.
   * Calcula el desfase de la zona para ese día (válido también en zonas con horario de verano).
   */
  toInstant(date: string, time: string): Date {
    const guess = new Date(`${date}T${time}:00.000Z`);
    const local = nowInZone(this.config.timezone, guess);
    const localAsUtc = new Date(`${local.date}T${local.time}:00.000Z`);
    return new Date(guess.getTime() - (localAsUtc.getTime() - guess.getTime()));
  }
}
