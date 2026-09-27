import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Role, UserDto } from '@odonto/shared';
import { firstValueFrom } from 'rxjs';
import { API } from './api.service';

export const HOME_BY_ROLE: Record<Role, string> = {
  PATIENT: '/paciente',
  DOCTOR: '/doctor',
  ADMIN: '/admin',
};

/** Estado de la sesión como signals. La sesión vive en cookies httpOnly (no accesibles desde JS). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<UserDto | null>(null);
  readonly loaded = signal(false);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly role = computed(() => this.user()?.role ?? null);
  readonly homeUrl = computed(() => (this.role() ? HOME_BY_ROLE[this.role()!] : '/login'));

  private loading: Promise<UserDto | null> | null = null;

  /** Carga el usuario actual una sola vez (reutiliza la promesa en curso). */
  ensureLoaded(): Promise<UserDto | null> {
    if (this.loaded()) return Promise.resolve(this.user());
    this.loading ??= firstValueFrom(this.http.get<UserDto>(`${API}/auth/me`))
      .then((u) => u)
      .catch(() => null)
      .then((u) => {
        this.user.set(u);
        this.loaded.set(true);
        this.loading = null;
        return u;
      });
    return this.loading;
  }

  providers() {
    return firstValueFrom(this.http.get<{ google: boolean; devLogin: boolean }>(`${API}/auth/providers`));
  }

  loginWithGoogle(): void {
    window.location.href = `${API}/auth/google`;
  }

  async devLogin(email: string): Promise<UserDto> {
    const u = await firstValueFrom(this.http.post<UserDto>(`${API}/auth/dev-login`, { email }));
    this.user.set(u);
    this.loaded.set(true);
    return u;
  }

  async acceptConsent(): Promise<void> {
    const u = await firstValueFrom(this.http.post<UserDto>(`${API}/auth/consent`, {}));
    this.user.set(u);
  }

  refresh() {
    return this.http.post<UserDto>(`${API}/auth/refresh`, {});
  }

  /** Limpia el estado local (sin llamar al servidor). */
  clear(): void {
    this.user.set(null);
    this.loaded.set(true);
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/logout`, {})).catch(() => undefined);
    this.clear();
    await this.router.navigateByUrl('/login');
  }
}
