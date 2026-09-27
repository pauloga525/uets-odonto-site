import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ERROR_MESSAGES, type ApiErrorDto } from '@odonto/shared';

/** Extrae el error de negocio de una respuesta HTTP. */
export function apiError(err: unknown): ApiErrorDto {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Partial<ApiErrorDto> | null;
    if (body?.code) return body as ApiErrorDto;
    if (err.status === 0) return { statusCode: 0, code: 'INTERNAL', message: 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.' };
    return { statusCode: err.status, code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL };
  }
  return { statusCode: 500, code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL };
}

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snack = inject(MatSnackBar);

  success(message: string) {
    this.snack.open(message, 'OK', { panelClass: 'snack-success' });
  }

  info(message: string) {
    this.snack.open(message, 'OK');
  }

  error(errOrMessage: unknown) {
    const message = typeof errOrMessage === 'string' ? errOrMessage : apiError(errOrMessage).message;
    this.snack.open(message, 'Cerrar', { panelClass: 'snack-error', duration: 8000, politeness: 'assertive' });
  }
}
