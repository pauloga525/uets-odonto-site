import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { auditQuerySchema } from '@odonto/shared';
import { z } from 'zod';
import { Roles } from '../../common/auth-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Roles('ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    return this.audit.list(q);
  }
}
