import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AppointmentQuery,
  BookAppointmentInput,
  CancelAppointmentInput,
  FinishAppointmentInput,
  SlotRef,
  appointmentQuerySchema,
  bookAppointmentSchema,
  cancelAppointmentSchema,
  finishAppointmentSchema,
  followUpSchema,
  rescheduleSchema,
} from '@odonto/shared';
import { AuthUser, Ctx, CurrentUser, RequestContext, Roles } from '../../common/auth-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AppointmentsService } from './appointments.service';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(appointmentQuerySchema)) q: AppointmentQuery) {
    return this.appointments.list(user, q);
  }

  @Roles('ADMIN', 'DOCTOR')
  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.appointments.stats(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.appointments.get(user, id);
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post()
  book(@Ctx() ctx: RequestContext, @Body(new ZodPipe(bookAppointmentSchema)) body: BookAppointmentInput) {
    return this.appointments.book(ctx, body);
  }

  @Roles('ADMIN', 'DOCTOR')
  @Post(':id/start')
  @HttpCode(200)
  start(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number) {
    return this.appointments.transition(ctx, id, 'start');
  }

  @Roles('ADMIN', 'DOCTOR')
  @Post(':id/process')
  @HttpCode(200)
  process(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number) {
    return this.appointments.transition(ctx, id, 'process');
  }

  @Roles('ADMIN', 'DOCTOR')
  @Post(':id/finish')
  @HttpCode(200)
  finish(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(finishAppointmentSchema)) body: FinishAppointmentInput) {
    return this.appointments.finish(ctx, id, body);
  }

  @Roles('ADMIN', 'DOCTOR')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(cancelAppointmentSchema)) body: CancelAppointmentInput) {
    return this.appointments.cancel(ctx, id, body.reason);
  }

  @Roles('ADMIN', 'DOCTOR')
  @Post(':id/follow-up')
  followUp(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(followUpSchema)) body: SlotRef) {
    return this.appointments.followUp(ctx, id, body);
  }

  @Roles('ADMIN', 'DOCTOR')
  @Patch(':id')
  reschedule(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(rescheduleSchema)) body: SlotRef) {
    return this.appointments.reschedule(ctx, id, body);
  }
}

@ApiTags('patients')
@Roles('ADMIN', 'DOCTOR')
@Controller('patients')
export class PatientsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.history(user, id);
  }
}
