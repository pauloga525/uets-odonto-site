import { HttpStatus, PipeTransform } from '@nestjs/common';
import { ZodTypeAny, z } from 'zod';
import { DomainException } from './domain.exception';

/** Valida y transforma body/query con un esquema Zod compartido con el frontend. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw new DomainException('VALIDATION', HttpStatus.BAD_REQUEST, details[0]?.message, details);
    }
    return result.data;
  }
}
