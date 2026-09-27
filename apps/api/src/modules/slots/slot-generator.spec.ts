import { canTransition, matchesEmailPattern, nextDoctorAction } from '@odonto/shared';
import { PlainPeriod, generateSlots, isConfiguredSlot } from './slot-generator';

const WEEKDAYS = [1, 2, 3, 4, 5];
const MORNING_AFTERNOON = [
  { startTime: '08:00', endTime: '12:00' },
  { startTime: '13:00', endTime: '17:00' },
];
const MIDDAY_EVENING = [
  { startTime: '11:00', endTime: '15:00' },
  { startTime: '16:00', endTime: '20:00' },
];

const PERIODS: PlainPeriod[] = [
  { startDate: '2026-10-12', endDate: '2026-10-16', weekdays: WEEKDAYS, blocks: MORNING_AFTERNOON },
  { startDate: '2026-10-19', endDate: '2026-10-23', weekdays: WEEKDAYS, blocks: MORNING_AFTERNOON },
  { startDate: '2026-10-26', endDate: '2026-10-30', weekdays: WEEKDAYS, blocks: MIDDAY_EVENING },
  { startDate: '2026-11-09', endDate: '2026-11-13', weekdays: WEEKDAYS, blocks: MIDDAY_EVENING },
];
const NONE = new Set<string>();

describe('generateSlots — configuración inicial', () => {
  it('período 1: genera los 8 horarios exactos de 08:00 a 17:00 con pausa de almuerzo', () => {
    const slots = generateSlots(PERIODS, NONE, '2026-10-14', '2026-10-14');
    expect(slots.get('2026-10-14')).toEqual(['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']);
  });

  it('período 3: genera los 8 horarios exactos de 11:00 a 20:00', () => {
    const slots = generateSlots(PERIODS, NONE, '2026-10-26', '2026-10-26');
    expect(slots.get('2026-10-26')).toEqual(['11:00', '12:00', '13:00', '14:00', '16:00', '17:00', '18:00', '19:00']);
  });

  it('genera 5 días × 8 horarios por período (160 en total)', () => {
    const slots = generateSlots(PERIODS, NONE, '2026-10-01', '2026-11-30');
    expect(slots.size).toBe(20);
    expect([...slots.values()].reduce((n, t) => n + t.length, 0)).toBe(160);
  });

  it('no genera fines de semana ni días fuera de los períodos', () => {
    const slots = generateSlots(PERIODS, NONE, '2026-10-17', '2026-10-18'); // sábado y domingo
    expect(slots.size).toBe(0);
    expect(generateSlots(PERIODS, NONE, '2026-11-02', '2026-11-06').size).toBe(0); // semana sin período
  });

  it('respeta los días no disponibles', () => {
    const slots = generateSlots(PERIODS, new Set(['2026-10-15']), '2026-10-12', '2026-10-16');
    expect(slots.has('2026-10-15')).toBe(false);
    expect(slots.size).toBe(4);
  });
});

describe('isConfiguredSlot — restricciones para nuevas citas (sección 12)', () => {
  it('26/10/2026 18:00–19:00 está permitido', () => {
    expect(isConfiguredSlot(PERIODS, NONE, '2026-10-26', '18:00')).toBe(true);
  });

  it('30/10/2026 20:00–21:00 NO está permitido (el horario termina a las 20:00)', () => {
    expect(isConfiguredSlot(PERIODS, NONE, '2026-10-30', '20:00')).toBe(false);
  });

  it('12:00 no es válido en el período 1 (almuerzo) pero sí en el período 3', () => {
    expect(isConfiguredSlot(PERIODS, NONE, '2026-10-14', '12:00')).toBe(false);
    expect(isConfiguredSlot(PERIODS, NONE, '2026-10-28', '12:00')).toBe(true);
  });

  it('15:00 no es válido en el período 3 (pausa 15–16)', () => {
    expect(isConfiguredSlot(PERIODS, NONE, '2026-10-27', '15:00')).toBe(false);
  });

  it('rechaza fechas fuera de todo período', () => {
    expect(isConfiguredSlot(PERIODS, NONE, '2026-11-03', '11:00')).toBe(false);
  });
});

describe('Máquina de estados de la cita', () => {
  it('sigue RESERVADA → INICIADA → EN_PROCESO → FINALIZADA', () => {
    expect(nextDoctorAction('RESERVADA')).toBe('start');
    expect(nextDoctorAction('INICIADA')).toBe('process');
    expect(nextDoctorAction('EN_PROCESO')).toBe('finish');
    expect(nextDoctorAction('FINALIZADA')).toBeNull();
  });

  it('solo se puede cancelar una cita RESERVADA', () => {
    expect(canTransition('RESERVADA', 'cancel')).toBe(true);
    expect(canTransition('INICIADA', 'cancel')).toBe(false);
    expect(canTransition('FINALIZADA', 'cancel')).toBe(false);
  });

  it('no permite saltarse pasos', () => {
    expect(canTransition('RESERVADA', 'finish')).toBe(false);
    expect(canTransition('RESERVADA', 'process')).toBe(false);
    expect(canTransition('CANCELADA', 'start')).toBe(false);
  });
});

describe('Bloqueo de cuentas estudiantiles (matchesEmailPattern)', () => {
  const STUDENTS = '*.est@uets.edu.ec';

  it('bloquea nombre.apellidos.est@uets.edu.ec', () => {
    expect(matchesEmailPattern('juan.perez.est@uets.edu.ec', STUDENTS)).toBe(true);
    expect(matchesEmailPattern('maria.jose.lopez.garcia.est@uets.edu.ec', STUDENTS)).toBe(true);
    expect(matchesEmailPattern('Juan.Perez.EST@UETS.EDU.EC', STUDENTS)).toBe(true);
  });

  it('no bloquea al personal ni correos parecidos', () => {
    expect(matchesEmailPattern('juan.perez@uets.edu.ec', STUDENTS)).toBe(false);
    expect(matchesEmailPattern('ernesto.estrada@uets.edu.ec', STUDENTS)).toBe(false);
    expect(matchesEmailPattern('juan.est@otrodominio.ec', STUDENTS)).toBe(false);
    expect(matchesEmailPattern('juanXest@uets.edu.ec', STUDENTS)).toBe(false); // el punto es literal
  });
});
