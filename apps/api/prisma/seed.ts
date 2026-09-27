/**
 * Datos iniciales:
 *  - Configuración general (dominios permitidos, políticas)
 *  - Usuario ADMIN y usuario DOCTOR (según BOOTSTRAP_*_EMAIL)
 *  - Los 4 períodos de atención de octubre/noviembre 2026
 * Es idempotente: puede ejecutarse varias veces sin duplicar datos.
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const prisma = new PrismaClient();

const date = (d: string) => new Date(`${d}T00:00:00.000Z`);
const time = (t: string) => new Date(`1970-01-01T${t}:00.000Z`);
const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const MORNING_AFTERNOON = [
  ['08:00', '12:00'],
  ['13:00', '17:00'],
];
const MIDDAY_EVENING = [
  ['11:00', '15:00'],
  ['16:00', '20:00'],
];

const PERIODS = [
  { name: 'Primer período', startDate: '2026-10-12', endDate: '2026-10-16', blocks: MORNING_AFTERNOON },
  { name: 'Segundo período', startDate: '2026-10-19', endDate: '2026-10-23', blocks: MORNING_AFTERNOON },
  { name: 'Tercer período', startDate: '2026-10-26', endDate: '2026-10-30', blocks: MIDDAY_EVENING },
  { name: 'Cuarto período', startDate: '2026-11-09', endDate: '2026-11-13', blocks: MIDDAY_EVENING },
];

async function main() {
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const doctorEmail = (process.env.BOOTSTRAP_DOCTOR_EMAIL ?? '').trim().toLowerCase();
  if (!adminEmail || !doctorEmail) throw new Error('Defina BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_DOCTOR_EMAIL en .env');

  await prisma.setting.upsert({
    where: { key: 'app' },
    update: {},
    create: {
      key: 'app',
      value: {
        allowedDomains: list(process.env.ALLOWED_DOMAINS),
        blockedEmailPatterns: list(process.env.BLOCKED_EMAIL_PATTERNS ?? '*.est@uets.edu.ec'),
        bookingLeadMinutes: 60,
        maxActivePerPatient: 1,
        clinicName: 'Consultorio Médico y Odontológico UETS',
        clinicLocation: 'Consultorio médico UETS',
      },
    },
  });

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', active: true },
    create: { email: adminEmail, name: 'Administrador', role: 'ADMIN' },
  });

  const doctorUser = await prisma.user.upsert({
    where: { email: doctorEmail },
    update: { role: 'DOCTOR', active: true },
    create: { email: doctorEmail, name: 'Doctor', role: 'DOCTOR' },
  });
  const doctor = await prisma.doctor.upsert({
    where: { userId: doctorUser.id },
    update: {},
    create: { userId: doctorUser.id, displayName: 'Dr. Consultorio UETS', specialty: 'Medicina general y odontología' },
  });

  for (const p of PERIODS) {
    const exists = await prisma.availabilityPeriod.findFirst({
      where: { doctorId: doctor.id, startDate: date(p.startDate), endDate: date(p.endDate) },
    });
    if (exists) continue;
    await prisma.availabilityPeriod.create({
      data: {
        doctorId: doctor.id,
        name: p.name,
        startDate: date(p.startDate),
        endDate: date(p.endDate),
        weekdays: [1, 2, 3, 4, 5],
        blocks: { create: p.blocks.map(([s, e]) => ({ startTime: time(s), endTime: time(e) })) },
      },
    });
  }

  const count = await prisma.availabilityPeriod.count();
  console.log(`Seed OK — admin: ${adminEmail}, doctor: ${doctorEmail}, períodos: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
