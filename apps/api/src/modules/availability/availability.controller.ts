import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExceptionInput, PeriodInput, exceptionSchema, periodSchema } from '@odonto/shared';
import { AuthUser, Ctx, CurrentUser, RequestContext, Roles } from '../../common/auth-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AvailabilityService } from './availability.service';

@ApiTags('availability')
@Roles('ADMIN', 'DOCTOR')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('periods')
  list(@CurrentUser() user: AuthUser, @Query('doctorId') doctorId?: string) {
    return this.availability.listPeriods(user, doctorId ? Number(doctorId) : undefined);
  }

  /** Vista previa de los horarios que generaría una configuración (no guarda). */
  @Post('preview')
  @HttpCode(200)
  preview(@CurrentUser() user: AuthUser, @Body(new ZodPipe(periodSchema)) body: PeriodInput) {
    return this.availability.preview(user, body);
  }

  @Post('periods')
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(periodSchema)) body: PeriodInput) {
    return this.availability.createPeriod(ctx, body);
  }

  @Put('periods/:id')
  update(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(periodSchema)) body: PeriodInput) {
    return this.availability.updatePeriod(ctx, id, body);
  }

  @Delete('periods/:id')
  @HttpCode(204)
  remove(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number) {
    return this.availability.deletePeriod(ctx, id);
  }

  @Get('exceptions')
  exceptions(@CurrentUser() user: AuthUser, @Query('doctorId') doctorId?: string) {
    return this.availability.listExceptions(user, doctorId ? Number(doctorId) : undefined);
  }

  @Post('exceptions')
  createException(@Ctx() ctx: RequestContext, @Body(new ZodPipe(exceptionSchema)) body: ExceptionInput) {
    return this.availability.createException(ctx, body);
  }

  @Delete('exceptions/:id')
  @HttpCode(204)
  removeException(@Ctx() ctx: RequestContext, @Param('id', ParseIntPipe) id: number) {
    return this.availability.deleteException(ctx, id);
  }
}
