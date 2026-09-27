import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { Role } from '@odonto/shared';
import { AuthService, HOME_BY_ROLE } from './auth.service';

// Nota: inject() solo es válido de forma síncrona; todas las dependencias se obtienen antes de cualquier await.

/** Requiere sesión iniciada y consentimiento de datos registrado. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureLoaded();
  if (!user) return router.createUrlTree(['/login'], { queryParams: state.url !== '/' ? { returnUrl: state.url } : {} });
  if (!user.consentAt) return router.createUrlTree(['/consentimiento']);
  return true;
};

/** Requiere sesión pero permite completar el consentimiento. */
export const sessionGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureLoaded();
  if (!user) return router.createUrlTree(['/login']);
  if (user.consentAt) return router.createUrlTree([HOME_BY_ROLE[user.role]]);
  return true;
};

/** Evita mostrar el login si ya hay sesión. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureLoaded();
  return user ? router.createUrlTree([HOME_BY_ROLE[user.role]]) : true;
};

/** Autorización por rol en el cliente (el backend vuelve a verificar siempre). */
export const roleGuard =
  (...roles: Role[]): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = await auth.ensureLoaded();
    if (user && roles.includes(user.role)) return true;
    return router.createUrlTree([user ? HOME_BY_ROLE[user.role] : '/login']);
  };

/** Redirige la raíz a la pantalla de inicio del rol. */
export const homeRedirectGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureLoaded();
  return router.createUrlTree([user ? HOME_BY_ROLE[user.role] : '/login']);
};
