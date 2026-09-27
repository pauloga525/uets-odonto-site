import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const NO_REFRESH = ['/auth/refresh', '/auth/me', '/auth/dev-login', '/auth/logout', '/auth/providers'];

let refreshing$: Observable<unknown> | null = null;

/**
 * Si el access token (15 min) expira, intenta renovarlo una sola vez con el refresh token
 * y reintenta la petición original. Las peticiones concurrentes comparten la misma renovación.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || NO_REFRESH.some((u) => req.url.includes(u))) {
        return throwError(() => err);
      }
      refreshing$ ??= auth.refresh().pipe(
        shareReplay(1),
        finalize(() => (refreshing$ = null)),
      );
      return refreshing$.pipe(
        switchMap(() => next(req.clone() as HttpRequest<unknown>)),
        catchError((refreshErr) => {
          auth.clear();
          void router.navigate(['/login'], { queryParams: { expired: 1 } });
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
