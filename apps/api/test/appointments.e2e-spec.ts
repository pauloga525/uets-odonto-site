import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { AppModule } from '../src/app.module';
import { ClockService } from '../src/common/clock.service';
import { PrismaService } from '../src/common/prisma.service';
import { AppConfig } from '../src/config/app-config';
import { configureApp } from '../src/main';

/** Reloj fijo: 1 de octubre de 2026, 10:00 en Guayaquil (antes del primer período). */
class FixedClock extends ClockService {
  override instant() {
    return new Date('2026-10-01T15:00:00.000Z');
  }
}

const date = (d: string) => new Date(`${d}T00:00:00.000Z`);
const time = (t: string) => new Date(`1970-01-01T${t}:00.000Z`);

interface Session {
  agent: TestAgent;
  xsrf: string;
  user: { id: string; role: string };
  post: (url: string, body?: object) => request.Test;
  get: (url: string) => request.Test;
}

describe('Citas — integración con PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  async function login(email: string): Promise<Session> {
    const agent = request.agent(baseUrl);
    const first = await agent.get('/api/v1/auth/providers');
    const cookies = ([] as string[]).concat(first.headers['set-cookie'] ?? []);
    const xsrf = /XSRF-TOKEN=([^;]+)/.exec(cookies.join(';'))![1];
    const res = await agent.post('/api/v1/auth/dev-login').set('X-XSRF-TOKEN', xsrf).send({ email });
    expect(res.status).toBe(200);
    return {
      agent,
      xsrf,
      user: res.body,
      post: (url, body = {}) => agent.post(`/api/v1${url}`).set('X-XSRF-TOKEN', xsrf).send(body),
      get: (url) => agent.get(`/api/v1${url}`),
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClockService)
      .useFactory({ factory: (c: AppConfig) => new FixedClock(c), inject: [AppConfig] })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await configureApp(app as NestExpressApplication);
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    prisma = app.get(PrismaService);

    await prisma.$executeRawUnsafe(
      'TRUNCATE audit_logs, refresh_tokens, appointments, availability_blocks, availability_periods, availability_exceptions, doctors, users, settings RESTART IDENTITY CASCADE',
    );
    await prisma.setting.create({
      data: {
        key: 'app',
        value: {
          allowedDomains: ['uets.edu.ec'],
          blockedEmailPatterns: ['*.est@uets.edu.ec'],
          bookingLeadMinutes: 60,
          maxActivePerPatient: 1,
          clinicName: 'Test',
          clinicLocation: 'Test',
        },
      },
    });
    const docUser = await prisma.user.create({ data: { email: 'doctor@uets.edu.ec', name: 'Doctor', role: 'DOCTOR' } });
    const doctor = await prisma.doctor.create({ data: { userId: docUser.id, displayName: 'Dr. Test' } });
    const blocks = (b: string[][]) => ({ create: b.map(([s, e]) => ({ startTime: time(s), endTime: time(e) })) });
    await prisma.availabilityPeriod.create({
      data: { doctorId: doctor.id, name: 'P1', startDate: date('2026-10-12'), endDate: date('2026-10-16'), weekdays: [1, 2, 3, 4, 5], blocks: blocks([['08:00', '12:00'], ['13:00', '17:00']]) },
    });
    await prisma.availabilityPeriod.create({
      data: { doctorId: doctor.id, name: 'P2', startDate: date('2026-10-19'), endDate: date('2026-10-23'), weekdays: [1, 2, 3, 4, 5], blocks: blocks([['08:00', '12:00'], ['13:00', '17:00']]) },
    });
    await prisma.availabilityPeriod.create({
      data: { doctorId: doctor.id, name: 'P3', startDate: date('2026-10-26'), endDate: date('2026-10-30'), weekdays: [1, 2, 3, 4, 5], blocks: blocks([['11:00', '15:00'], ['16:00', '20:00']]) },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Autenticación y seguridad', () => {
    it('rechaza correos fuera del dominio autorizado', async () => {
      const agent = request.agent(baseUrl);
      const first = await agent.get('/api/v1/auth/providers');
      const xsrf = /XSRF-TOKEN=([^;]+)/.exec(([] as string[]).concat(first.headers['set-cookie']).join(';'))![1];
      const res = await agent.post('/api/v1/auth/dev-login').set('X-XSRF-TOKEN', xsrf).send({ email: 'usuario@gmail.com' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DOMAIN_NOT_ALLOWED');
    });

    it('rechaza las cuentas estudiantiles (*.est@uets.edu.ec) aunque sean del dominio', async () => {
      const agent = request.agent(baseUrl);
      const first = await agent.get('/api/v1/auth/providers');
      const xsrf = /XSRF-TOKEN=([^;]+)/.exec(([] as string[]).concat(first.headers['set-cookie']).join(';'))![1];
      const res = await agent.post('/api/v1/auth/dev-login').set('X-XSRF-TOKEN', xsrf).send({ email: 'juan.perez.est@uets.edu.ec' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_ALLOWED');
      expect(await prisma.user.count({ where: { email: 'juan.perez.est@uets.edu.ec' } })).toBe(0);
    });

    it('asigna el rol PATIENT a un correo del dominio y DOCTOR al correo configurado', async () => {
      expect((await login('nuevo@uets.edu.ec')).user.role).toBe('PATIENT');
      expect((await login('doctor@uets.edu.ec')).user.role).toBe('DOCTOR');
    });

    it('promueve a ADMIN a una cuenta existente cuyo correo es el administrador configurado', async () => {
      await prisma.user.upsert({ where: { email: 'admin@uets.edu.ec' }, update: { role: 'PATIENT' }, create: { email: 'admin@uets.edu.ec', name: 'Admin', role: 'PATIENT' } });
      expect((await login('admin@uets.edu.ec')).user.role).toBe('ADMIN');
    });

    it('exige token CSRF en operaciones que modifican datos', async () => {
      const s = await login('csrf@uets.edu.ec');
      const res = await s.agent.post('/api/v1/appointments').send({ date: '2026-10-14', startTime: '08:00' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF');
    });

    it('rechaza peticiones sin sesión', async () => {
      const res = await request(baseUrl).get('/api/v1/appointments');
      expect(res.status).toBe(401);
    });
  });

  describe('Disponibilidad y reserva', () => {
    it('muestra los 8 horarios del día y la reserva los marca como ocupados', async () => {
      const p = await login('ana@uets.edu.ec');
      const before = await p.get('/slots?date=2026-10-14');
      expect(before.body.slots.map((s: any) => s.startTime)).toEqual(['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']);
      expect(before.body.slots.every((s: any) => s.available)).toBe(true);

      const res = await p.post('/appointments', { date: '2026-10-14', startTime: '10:00' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ date: '2026-10-14', startTime: '10:00', endTime: '11:00', status: 'RESERVADA' });

      const after = await p.get('/slots?date=2026-10-14');
      const slot = after.body.slots.find((s: any) => s.startTime === '10:00');
      expect(slot.available).toBe(false);
      expect(slot.appointment).toBeUndefined(); // el paciente no ve datos de otros
    });

    it('rechaza horarios fuera de la configuración (30/10 20:00) y en pausa de almuerzo', async () => {
      const p = await login('luis@uets.edu.ec');
      const late = await p.post('/appointments', { date: '2026-10-30', startTime: '20:00' });
      expect(late.status).toBe(422);
      expect(late.body.code).toBe('OUTSIDE_AVAILABILITY');
      const lunch = await p.post('/appointments', { date: '2026-10-14', startTime: '12:00' });
      expect(lunch.body.code).toBe('OUTSIDE_AVAILABILITY');
      const halfHour = await p.post('/appointments', { date: '2026-10-14', startTime: '10:30' });
      expect(halfHour.status).toBe(400);
    });

    it('aplica el límite de citas activas por paciente', async () => {
      const p = await login('ana@uets.edu.ec');
      const res = await p.post('/appointments', { date: '2026-10-15', startTime: '08:00' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACTIVE_LIMIT');
    });

    it('CONCURRENCIA: 50 pacientes confirman el mismo horario a la vez y solo 1 lo obtiene', async () => {
      const sessions = await Promise.all(Array.from({ length: 50 }, (_, i) => login(`race${i}@uets.edu.ec`)));
      const results = await Promise.all(sessions.map((s) => s.post('/appointments', { date: '2026-10-15', startTime: '09:00' })));
      const ok = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      expect(ok).toHaveLength(1);
      expect(conflicts).toHaveLength(49);
      expect(conflicts.every((r) => r.body.code === 'SLOT_TAKEN')).toBe(true);
      expect(conflicts[0].body.message).toBe(
        'El horario seleccionado acaba de ser reservado por otro usuario. Por favor, selecciona otro horario.',
      );
      const rows = await prisma.appointment.count({ where: { appointmentDate: date('2026-10-15'), startTime: time('09:00') } });
      expect(rows).toBe(1);
    });

    it('el paciente NO puede cancelar su propia cita', async () => {
      const p = await login('nocancela@uets.edu.ec');
      const booked = await p.post('/appointments', { date: '2026-10-16', startTime: '15:00' });
      expect(booked.status).toBe(201);
      expect(booked.body.canCancel).toBe(false);
      const res = await p.post(`/appointments/${booked.body.id}/cancel`, { reason: 'No puedo asistir' });
      expect(res.status).toBe(403);
      expect((await p.get(`/appointments/${booked.body.id}`)).body.status).toBe('RESERVADA');
    });

    it('al cancelar (doctor), el horario queda libre y otro paciente puede reservarlo', async () => {
      const a = await login('cancela@uets.edu.ec');
      const booked = await a.post('/appointments', { date: '2026-10-16', startTime: '13:00' });
      expect(booked.status).toBe(201);
      const d = await login('doctor@uets.edu.ec');
      const cancelled = await d.post(`/appointments/${booked.body.id}/cancel`, { reason: 'Paciente avisó que no asistirá' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('CANCELADA');

      const b = await login('reemplazo@uets.edu.ec');
      const rebook = await b.post('/appointments', { date: '2026-10-16', startTime: '13:00' });
      expect(rebook.status).toBe(201);
    });

    it('un paciente no puede ver ni operar citas de otro', async () => {
      const owner = await login('dueno@uets.edu.ec');
      const appt = await owner.post('/appointments', { date: '2026-10-16', startTime: '14:00' });
      const other = await login('intruso@uets.edu.ec');
      expect((await other.get(`/appointments/${appt.body.id}`)).status).toBe(404);
      expect((await other.post(`/appointments/${appt.body.id}/cancel`)).status).toBe(403);
      expect((await owner.post(`/appointments/${appt.body.id}/start`)).status).toBe(403);
    });
  });

  describe('Atención del doctor y seguimiento', () => {
    let apptId: number;
    let patientId: string;

    beforeAll(async () => {
      const p = await login('juan@uets.edu.ec');
      patientId = p.user.id;
      const res = await p.post('/appointments', { date: '2026-10-19', startTime: '09:00' });
      apptId = res.body.id;
    });

    it('recorre RESERVADA → INICIADA → EN_PROCESO y no permite saltar pasos', async () => {
      const d = await login('doctor@uets.edu.ec');
      expect((await d.post(`/appointments/${apptId}/finish`, { observations: 'x' })).body.code).toBe('INVALID_TRANSITION');
      expect((await d.post(`/appointments/${apptId}/start`)).body.status).toBe('INICIADA');
      expect((await d.post(`/appointments/${apptId}/process`)).body.status).toBe('EN_PROCESO');
    });

    it('el seguimiento solo acepta horarios configurados y libres', async () => {
      const d = await login('doctor@uets.edu.ec');
      const bad = await d.post(`/appointments/${apptId}/finish`, {
        observations: 'Control',
        followUp: { date: '2026-10-30', startTime: '20:00' },
      });
      expect(bad.body.code).toBe('OUTSIDE_AVAILABILITY');
      const taken = await d.post(`/appointments/${apptId}/finish`, {
        observations: 'Control',
        followUp: { date: '2026-10-15', startTime: '09:00' }, // ganado en la prueba de concurrencia
      });
      expect(taken.body.code).toBe('SLOT_TAKEN');
      // La transacción se revirtió: la cita sigue EN_PROCESO
      expect((await d.get(`/appointments/${apptId}`)).body.status).toBe('EN_PROCESO');
    });

    it('finaliza con observaciones y crea la cita de seguimiento enlazada', async () => {
      const d = await login('doctor@uets.edu.ec');
      const res = await d.post(`/appointments/${apptId}/finish`, {
        observations: 'Seguimiento recomendado.',
        followUp: { date: '2026-10-26', startTime: '18:00' },
      });
      expect(res.status).toBe(200);
      expect(res.body.appointment).toMatchObject({ status: 'FINALIZADA', observations: 'Seguimiento recomendado.' });
      expect(res.body.followUp).toMatchObject({ date: '2026-10-26', startTime: '18:00', status: 'RESERVADA', previousAppointmentId: apptId });

      const history = await d.get(`/patients/${patientId}/history`);
      expect(history.body.items.map((a: any) => a.status)).toEqual(['RESERVADA', 'FINALIZADA']);

      // Las observaciones se guardan cifradas en BD
      const raw = await prisma.appointment.findUnique({ where: { id: apptId } });
      expect(raw!.observations).toMatch(/^enc:v1:/);
    });

    it('el paciente no ve las observaciones clínicas', async () => {
      const p = await login('juan@uets.edu.ec');
      const res = await p.get(`/appointments/${apptId}`);
      expect(res.body.observations).toBeUndefined();
    });

    it('registra la auditoría de cada transición', async () => {
      const logs = await prisma.auditLog.findMany({ where: { entity: 'appointment', entityId: String(apptId) }, orderBy: { id: 'asc' } });
      expect(logs.map((l) => l.action)).toEqual(['RESERVAR_CITA', 'INICIAR_CITA', 'CITA_EN_PROCESO', 'FINALIZAR_CITA']);
      expect(logs[3]).toMatchObject({ fromStatus: 'EN_PROCESO', toStatus: 'FINALIZADA' });
    });
  });

  describe('Administración de disponibilidad', () => {
    it('impide eliminar un período que tiene citas reservadas', async () => {
      const admin = await login('admin@uets.edu.ec');
      const periods = await admin.get('/availability/periods');
      const p1 = periods.body.find((p: any) => p.name === 'P1');
      expect(p1.slotCount).toBe(40);
      const res = await admin.agent.delete(`/api/v1/availability/periods/${p1.id}`).set('X-XSRF-TOKEN', admin.xsrf);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('AVAILABILITY_IN_USE');
    });

    it('la vista previa genera los horarios sin guardar', async () => {
      const admin = await login('admin@uets.edu.ec');
      const res = await admin.post('/availability/preview', {
        name: 'Cuarto período',
        startDate: '2026-11-09',
        endDate: '2026-11-13',
        weekdays: [1, 2, 3, 4, 5],
        blocks: [
          { startTime: '11:00', endTime: '15:00' },
          { startTime: '16:00', endTime: '20:00' },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.totalSlots).toBe(40);
    });

    it('un paciente no puede administrar disponibilidad', async () => {
      const p = await login('ana@uets.edu.ec');
      expect((await p.get('/availability/periods')).status).toBe(403);
    });
  });
});
