import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** true si el error proviene de una restricción UNIQUE (incluye índices parciales creados por SQL). */
export function isUniqueViolation(err: unknown, indexName?: string): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    if (!indexName) return true;
    return JSON.stringify(err.meta ?? {}).includes(indexName) || err.message.includes(indexName);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('23505') && (!indexName || msg.includes(indexName));
}
