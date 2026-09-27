import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { Role } from '@odonto/shared';
import { map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { initials } from '../core/format';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Visible en la barra inferior móvil (máx. 4). */
  mobile?: boolean;
}

const NAV: Record<Role, NavItem[]> = {
  PATIENT: [
    { path: '/paciente/inicio', label: 'Inicio', icon: 'home', mobile: true },
    { path: '/paciente/reservar', label: 'Reservar', icon: 'add_circle', mobile: true },
    { path: '/paciente/mis-citas', label: 'Mis citas', icon: 'event_note', mobile: true },
  ],
  DOCTOR: [
    { path: '/doctor/hoy', label: 'Hoy', icon: 'today', mobile: true },
    { path: '/doctor/agenda', label: 'Agenda', icon: 'calendar_month', mobile: true },
    { path: '/doctor/citas', label: 'Citas', icon: 'event_note', mobile: true },
    { path: '/doctor/disponibilidad', label: 'Disponibilidad', icon: 'event_available', mobile: true },
  ],
  ADMIN: [
    { path: '/admin/panel', label: 'Panel', icon: 'dashboard', mobile: true },
    { path: '/admin/agenda', label: 'Agenda', icon: 'calendar_month' },
    { path: '/admin/citas', label: 'Citas', icon: 'event_note', mobile: true },
    { path: '/admin/disponibilidad', label: 'Disponibilidad', icon: 'event_available', mobile: true },
    { path: '/admin/usuarios', label: 'Usuarios', icon: 'group', mobile: true },
    { path: '/admin/configuracion', label: 'Configuración', icon: 'settings' },
    { path: '/admin/auditoria', label: 'Auditoría', icon: 'history' },
  ],
};

const ROLE_LABEL: Record<Role, string> = { PATIENT: 'Paciente', DOCTOR: 'Doctor', ADMIN: 'Administrador' };

type ThemePref = 'system' | 'light' | 'dark';

function readTheme(): ThemePref {
  try {
    return (localStorage.getItem('theme') as ThemePref) || 'system';
  } catch {
    return 'system';
  }
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Saltar al contenido</a>
    <div class="layout" [class.mobile]="isMobile()">
      @if (!isMobile()) {
        <nav class="rail" aria-label="Navegación principal">
          <div class="brand">
            <div class="logo" aria-hidden="true"><mat-icon>dentistry</mat-icon></div>
            <div>
              <strong>Citas UETS</strong>
              <span>Médicas y odontológicas</span>
            </div>
          </div>
          <ul>
            @for (item of nav(); track item.path) {
              <li>
                <a [routerLink]="item.path" routerLinkActive="active" #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
                  <mat-icon aria-hidden="true" [class.icon-filled]="rla.isActive">{{ item.icon }}</mat-icon>
                  <span>{{ item.label }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>
      }

      <div class="content">
        <header class="topbar">
          @if (isMobile()) {
            <div class="brand small">
              <div class="logo" aria-hidden="true"><mat-icon>dentistry</mat-icon></div>
              <strong>Citas UETS</strong>
            </div>
          }
          <span class="spacer"></span>
          <button matIconButton [matMenuTriggerFor]="themeMenu" matTooltip="Tema" aria-label="Cambiar tema">
            <mat-icon>{{ themeIcon() }}</mat-icon>
          </button>
          <mat-menu #themeMenu="matMenu">
            <button mat-menu-item (click)="setTheme('system')"><mat-icon>brightness_auto</mat-icon>Automático</button>
            <button mat-menu-item (click)="setTheme('light')"><mat-icon>light_mode</mat-icon>Claro</button>
            <button mat-menu-item (click)="setTheme('dark')"><mat-icon>dark_mode</mat-icon>Oscuro</button>
          </mat-menu>

          <button class="user-btn" [matMenuTriggerFor]="userMenu" aria-label="Menú de usuario">
            @if (user()?.avatarUrl) {
              <img [src]="user()!.avatarUrl" alt="" referrerpolicy="no-referrer" />
            } @else {
              <span class="avatar">{{ userInitials() }}</span>
            }
            @if (!isMobile()) {
              <span class="user-info">
                <strong>{{ user()?.name }}</strong>
                <span>{{ roleLabel() }}</span>
              </span>
              <mat-icon aria-hidden="true">expand_more</mat-icon>
            }
          </button>
          <mat-menu #userMenu="matMenu" xPosition="before">
            <div class="menu-user" (click)="$event.stopPropagation()">
              <strong>{{ user()?.name }}</strong>
              <span>{{ user()?.email }}</span>
              <span class="role">{{ roleLabel() }}</span>
            </div>
            <mat-divider />
            @if (isMobile()) {
              @for (item of extraNav(); track item.path) {
                <a mat-menu-item [routerLink]="item.path"><mat-icon>{{ item.icon }}</mat-icon>{{ item.label }}</a>
              }
              @if (extraNav().length) {
                <mat-divider />
              }
            }
            <button mat-menu-item (click)="logout()"><mat-icon>logout</mat-icon>Cerrar sesión</button>
          </mat-menu>
        </header>

        <main id="main" tabindex="-1">
          <router-outlet />
        </main>
      </div>

      @if (isMobile()) {
        <nav class="bottom-nav" aria-label="Navegación principal">
          @for (item of mobileNav(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
              <span class="pill"><mat-icon aria-hidden="true" [class.icon-filled]="rla.isActive">{{ item.icon }}</mat-icon></span>
              <span class="lbl">{{ item.label }}</span>
            </a>
          }
        </nav>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }
    .skip-link {
      position: absolute;
      left: -9999px;
      top: 8px;
      z-index: 100;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      padding: 8px 16px;
      border-radius: 8px;
    }
    .skip-link:focus {
      left: 8px;
    }
    .layout {
      display: flex;
      min-height: 100vh;
    }
    .rail {
      width: 256px;
      flex: 0 0 256px;
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 20px 12px;
      background: var(--mat-sys-surface-container-low);
      border-right: 1px solid var(--mat-sys-outline-variant);
      display: flex;
      flex-direction: column;
      gap: 24px;
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      a {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 48px;
        padding: 0 16px;
        border-radius: 24px;
        color: var(--mat-sys-on-surface-variant);
        text-decoration: none;
        font: var(--mat-sys-label-large);
        transition: background 0.15s;
      }
      a:hover {
        background: var(--mat-sys-surface-container-highest);
      }
      a.active {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
        font-weight: 600;
      }
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 8px;
      strong {
        display: block;
        font: var(--mat-sys-title-medium);
        font-weight: 700;
      }
      span {
        font: var(--mat-sys-body-small);
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .brand.small {
      padding: 0;
      gap: 8px;
    }
    .logo {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }
    .small .logo {
      width: 34px;
      height: 34px;
      border-radius: 10px;
    }
    .content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 4px;
      height: 64px;
      padding: 0 16px;
      background: color-mix(in srgb, var(--app-bg) 85%, transparent);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .user-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      padding: 4px 8px 4px 4px;
      border-radius: 28px;
      cursor: pointer;
      min-height: 44px;
    }
    .user-btn:hover {
      background: var(--mat-sys-surface-container-high);
    }
    .user-btn img,
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
    }
    .avatar {
      display: grid;
      place-items: center;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-label-large);
      font-weight: 700;
    }
    .user-info {
      display: flex;
      flex-direction: column;
      text-align: left;
      line-height: 1.2;
      strong {
        font: var(--mat-sys-label-large);
      }
      span {
        font: var(--mat-sys-body-small);
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .menu-user {
      display: flex;
      flex-direction: column;
      padding: 12px 16px;
      gap: 2px;
      span {
        font: var(--mat-sys-body-small);
        color: var(--mat-sys-on-surface-variant);
      }
      .role {
        margin-top: 4px;
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
    }
    main {
      flex: 1;
      outline: none;
    }
    .mobile main {
      padding-bottom: calc(80px + env(safe-area-inset-bottom));
    }
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 20;
      display: flex;
      justify-content: space-around;
      padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
      background: var(--mat-sys-surface-container);
      border-top: 1px solid var(--mat-sys-outline-variant);
      a {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        text-decoration: none;
        color: var(--mat-sys-on-surface-variant);
        min-height: 56px;
        justify-content: center;
      }
      .pill {
        width: 56px;
        height: 32px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        transition: background 0.2s;
      }
      .lbl {
        font: var(--mat-sys-label-medium);
      }
      a.active {
        color: var(--mat-sys-on-surface);
        .pill {
          background: var(--mat-sys-secondary-container);
          color: var(--mat-sys-on-secondary-container);
        }
        .lbl {
          font-weight: 700;
        }
      }
    }
  `,
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly breakpoints = inject(BreakpointObserver);

  protected readonly isMobile = toSignal(this.breakpoints.observe('(max-width: 840px)').pipe(map((r) => r.matches)), { initialValue: false });
  protected readonly user = this.auth.user;
  protected readonly nav = computed(() => (this.auth.role() ? NAV[this.auth.role()!] : []));
  protected readonly mobileNav = computed(() => this.nav().filter((n) => n.mobile));
  protected readonly extraNav = computed(() => this.nav().filter((n) => !n.mobile));
  protected readonly roleLabel = computed(() => (this.auth.role() ? ROLE_LABEL[this.auth.role()!] : ''));
  protected readonly userInitials = computed(() => initials(this.user()?.name ?? ''));
  protected readonly theme = signal<ThemePref>(readTheme());
  protected readonly themeIcon = computed(() => ({ system: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' })[this.theme()]);

  constructor() {
    this.applyTheme(this.theme());
  }

  protected setTheme(t: ThemePref) {
    this.theme.set(t);
    this.applyTheme(t);
    try {
      localStorage.setItem('theme', t);
    } catch {
      /* almacenamiento no disponible */
    }
  }

  private applyTheme(t: ThemePref) {
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  protected logout() {
    void this.auth.logout();
  }
}
