import { Injectable, OnDestroy } from '@angular/core';
import type { SlotChangedEvent } from '@odonto/shared';
import { Subject } from 'rxjs';
import { Socket, io } from 'socket.io-client';

/**
 * Conexión WebSocket para disponibilidad en tiempo real.
 * Se conecta bajo demanda y reenvía la suscripción al reconectar.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private socket: Socket | null = null;
  private watching: { doctorId: number; month: string } | null = null;

  readonly slotChanged$ = new Subject<SlotChangedEvent>();
  readonly agendaChanged$ = new Subject<{ date: string }>();

  private connect(): Socket {
    if (this.socket) return this.socket;
    this.socket = io({ path: '/api/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => {
      if (this.watching) this.socket!.emit('watch', this.watching);
    });
    this.socket.on('slot.changed', (e: SlotChangedEvent) => this.slotChanged$.next(e));
    this.socket.on('agenda.changed', (e: { date: string }) => this.agendaChanged$.next(e));
    return this.socket;
  }

  /** Suscribe al mes visible del calendario. */
  watchMonth(doctorId: number, month: string): void {
    this.watching = { doctorId, month };
    const s = this.connect();
    if (s.connected) s.emit('watch', this.watching);
  }

  /** Para el personal: basta con conectarse para recibir `agenda.changed`. */
  ensureConnected(): void {
    this.connect();
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.watching = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
