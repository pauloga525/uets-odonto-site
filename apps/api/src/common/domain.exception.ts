import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_MESSAGES, ErrorCode } from '@odonto/shared';

/** Error de negocio con código estable que el frontend puede interpretar. */
export class DomainException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: HttpStatus,
    message?: string,
    public readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message: message ?? ERROR_MESSAGES[code], details }, status);
  }

  static conflict(code: ErrorCode, message?: string, details?: unknown) {
    return new DomainException(code, HttpStatus.CONFLICT, message, details);
  }
  static unprocessable(code: ErrorCode, message?: string, details?: unknown) {
    return new DomainException(code, HttpStatus.UNPROCESSABLE_ENTITY, message, details);
  }
  static notFound(message?: string) {
    return new DomainException('NOT_FOUND', HttpStatus.NOT_FOUND, message);
  }
  static forbidden(message?: string) {
    return new DomainException('FORBIDDEN', HttpStatus.FORBIDDEN, message);
  }
}
