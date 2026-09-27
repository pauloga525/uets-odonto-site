import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { calendarQuerySchema, listDates, rangeQuerySchema, slotsQuerySchema } from '@odonto/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-context';
import { DomainException } from '../../common/domain.exception';
import { PrismaService } from '../../common/prisma.service';
import { ZodPipe } from '../../common/zod.pipe';
import { SlotsService } from './slots.service';

@ApiTags('slots')
@Controller('slots')
export class SlotsController {
  constructor(
    private readonly slots: SlotsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Horarios de un día con su estado (sin datos personales para pacientes). */
  @Get()
  day(@Query(new ZodPipe(slotsQuerySchema)) q: z.infer<typeof slotsQuerySchema>, @CurrentUser() user: AuthUser) {
    return this.slots.daySlots(q.date, user.role, q.doctorId);
  }

  @Get('calendar')
  calendar(@Query(new ZodPipe(calendarQuerySchema)) q: z.infer<typeof calendarQuerySchema>, @CurrentUser() user: AuthUser) {
    return this.slots.calendar(q.month, user.role, q.doctorId);
  }

  @Roles('ADMIN', 'DOCTOR')
  @Get('range')
  range(@Query(new ZodPipe(rangeQuerySchema)) q: z.infer<typeof rangeQuerySchema>, @CurrentUser() user: AuthUser) {
    if (q.to < q.from || listDates(q.from, q.to).length > 62) throw DomainException.unprocessable('VALIDATION', 'Rango de fechas inválido (máximo 62 días).');
    return this.slots.rangeSlots(q.from, q.to, user.role, q.doctorId);
  }

  @Get('next')
  next(@CurrentUser() user: AuthUser) {
    return this.slots.nextAvailable(user.role);
  }

  @Get('doctors')
  doctors() {
    return this.prisma.doctor.findMany({
      where: { active: true },
      select: { id: true, displayName: true, specialty: true },
      orderBy: { id: 'asc' },
    });
  }
}
