import { formatDate, parseDate } from '@odonto/shared';

/**
 * Conversión entre las cadenas del dominio ('YYYY-MM-DD', 'HH:MM') y los tipos
 * DATE / TIME de PostgreSQL, que Prisma representa como Date en UTC.
 */
export const toDbDate = (date: string): Date => parseDate(date);
export const fromDbDate = (d: Date): string => formatDate(d);

export const toDbTime = (time: string): Date => new Date(`1970-01-01T${time}:00.000Z`);
export const fromDbTime = (d: Date): string => d.toISOString().slice(11, 16);
