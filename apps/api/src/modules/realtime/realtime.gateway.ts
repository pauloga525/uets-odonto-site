import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { SlotChangedEvent } from '@odonto/shared';
import { parse } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { ACCESS_COOKIE, TokenService } from '../auth/token.service';

const monthRoom = (doctorId: number, month: string) => `slots:${doctorId}:${month}`;
const STAFF_ROOM = 'staff';

/**
 * Disponibilidad en tiempo real. Los clientes se suscriben al mes que están viendo
 * y reciben `slot.changed` (sin datos personales) cuando alguien reserva o libera un horario.
 * El personal (doctor/admin) recibe además `agenda.changed` para refrescar su agenda.
 */
@WebSocketGateway({ path: '/api/socket.io', cors: { origin: process.env.WEB_URL ?? 'http://localhost:4200', credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(private readonly tokens: TokenService) {}

  async handleConnection(client: Socket) {
    const cookies = parse(client.handshake.headers.cookie ?? '');
    const payload = await this.tokens.verifyAccess(cookies[ACCESS_COOKIE]);
    if (!payload) {
      client.emit('auth.error');
      client.disconnect(true);
      return;
    }
    client.data.userId = payload.sub;
    if (payload.role !== 'PATIENT') await client.join(STAFF_ROOM);
  }

  @SubscribeMessage('watch')
  async watch(@ConnectedSocket() client: Socket, @MessageBody() body: { doctorId: number; month: string }) {
    if (!body || typeof body.doctorId !== 'number' || !/^\d{4}-\d{2}$/.test(body.month ?? '')) return { ok: false };
    for (const room of client.rooms) if (room.startsWith('slots:')) await client.leave(room);
    await client.join(monthRoom(body.doctorId, body.month));
    return { ok: true };
  }

  emitSlotChanged(event: SlotChangedEvent) {
    if (!this.server) return;
    this.server.to(monthRoom(event.doctorId, event.date.slice(0, 7))).emit('slot.changed', event);
    this.server.to(STAFF_ROOM).emit('agenda.changed', { date: event.date });
  }

  emitAgendaChanged(date: string) {
    this.server?.to(STAFF_ROOM).emit('agenda.changed', { date });
  }
}
