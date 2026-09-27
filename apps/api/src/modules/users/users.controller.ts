import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpdateUserInput, updateUserSchema, userQuerySchema } from '@odonto/shared';
import { z } from 'zod';
import { Ctx, RequestContext, Roles } from '../../common/auth-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Roles('ADMIN')
  @Get()
  list(@Query(new ZodPipe(userQuerySchema)) q: z.infer<typeof userQuerySchema>) {
    return this.users.list(q);
  }

  @Roles('ADMIN', 'DOCTOR')
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.toDto(await this.users.findById(id));
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateUserSchema)) body: UpdateUserInput, @Ctx() ctx: RequestContext) {
    const { before, after } = await this.users.update(id, body, ctx.user);
    await this.audit.log(ctx, {
      action: 'ACTUALIZAR_USUARIO',
      entity: 'user',
      entityId: id,
      metadata: { before: { role: before.role, active: before.active }, after: { role: after.role, active: after.active } },
    });
    return after;
  }
}
