import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogDto, PageDto } from '@odonto/shared';
import { RequestContext } from '../../common/auth-context';
import { PrismaService, Tx } from '../../common/prisma.service';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | number | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  metadata?: unknown;
}

/** Registro de auditoría: quién hizo qué, cuándo, desde dónde y el cambio de estado. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(ctx: Partial<RequestContext> | null, entry: AuditEntry, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          userId: ctx?.user?.id ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId != null ? String(entry.entityId) : null,
          fromStatus: entry.fromStatus ?? null,
          toStatus: entry.toStatus ?? null,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      // Dentro de una transacción el error debe propagarse; fuera, la auditoría nunca bloquea la operación.
      if (tx) throw err;
      this.logger.error(`No se pudo registrar auditoría ${entry.action}: ${(err as Error).message}`);
    }
  }

  async list(q: { entity?: string; entityId?: string; page: number; pageSize: number }): Promise<PageDto<AuditLogDto>> {
    const where: Prisma.AuditLogWhereInput = { entity: q.entity, entityId: q.entityId };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.id.toString(),
        user: r.user,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        ip: r.ip,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
