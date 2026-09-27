import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ApiErrorDto, ERROR_MESSAGES, ErrorCode } from '@odonto/shared';
import { Response } from 'express';
import { isUniqueViolation } from './prisma.service';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMIT',
};

/** Normaliza todas las respuestas de error a { statusCode, code, message, details }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (!res || typeof res.status !== 'function') return; // contexto WebSocket

    let body: ApiErrorDto;
    if (exception instanceof ThrottlerException) {
      body = { statusCode: 429, code: 'RATE_LIMIT', message: ERROR_MESSAGES.RATE_LIMIT };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse() as any;
      const code: ErrorCode = response?.code ?? STATUS_CODES[status] ?? 'INTERNAL';
      body = {
        statusCode: status,
        code,
        message: response?.code ? response.message : (ERROR_MESSAGES[code] ?? exception.message),
        details: response?.details,
      };
    } else if (isUniqueViolation(exception, 'uq_appt_slot_active')) {
      body = { statusCode: 409, code: 'SLOT_TAKEN', message: ERROR_MESSAGES.SLOT_TAKEN };
    } else if (isUniqueViolation(exception)) {
      body = { statusCode: 409, code: 'VALIDATION', message: 'El registro ya existe.' };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL };
    }
    res.status(body.statusCode).json(body);
  }
}
