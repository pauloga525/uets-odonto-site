import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { ERROR_MESSAGES } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { AuthService, HOME_BY_ROLE } from '../../core/auth.service';
import { apiError } from '../../core/notify.service';

const LOGIN_ERRORS: Record<string, string> = {
  domain: ERROR_MESSAGES.DOMAIN_NOT_ALLOWED,
  blocked: ERROR_MESSAGES.EMAIL_NOT_ALLOWED,
  inactive: ERROR_MESSAGES.USER_INACTIVE,
  oauth: 'No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo.',
  cancelled: 'Se canceló el inicio de sesión.',
};

@Component({
  selector: 'app-login-page',
  imports: [MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <section class="hero" aria-hidden="true">
        <div class="hero-inner">
          <div class="logo"><mat-icon>dentistry</mat-icon></div>
          <h2>Tu cita médica u odontológica, en tres pasos.</h2>
          <ol>
            <li><mat-icon>calendar_month</mat-icon>Elige una fecha disponible</li>
            <li><mat-icon>schedule</mat-icon>Selecciona tu horario</li>
            <li><mat-icon>check_circle</mat-icon>Confirma y listo</li>
          </ol>
        </div>
      </section>

      <main class="panel">
        <div class="card">
          <div class="logo small" aria-hidden="true"><mat-icon>dentistry</mat-icon></div>
          <h1>{{ clinicName() }}</h1>
          <p class="sub">Reserva y gestión de citas médicas y odontológicas</p>

          @if (errorMessage()) {
            <div class="alert" role="alert">
              <mat-icon aria-hidden="true">error</mat-icon>
              <span>{{ errorMessage() }}</span>
            </div>
          }
          @if (expired()) {
            <div class="alert info" role="status">
              <mat-icon aria-hidden="true">info</mat-icon>
              <span>Tu sesión expiró. Inicia sesión nuevamente.</span>
            </div>
          }

          <button class="google-btn" type="button" (click)="google()" [disabled]="!providers().google || busy()">
            <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            <span>Iniciar sesión con Google</span>
          </button>
          @if (!providers().google && providersLoaded()) {
            <p class="hint">El inicio de sesión con Google aún no está configurado en el servidor.</p>
          }
          @if (domains().length) {
            <p class="hint">
              <mat-icon aria-hidden="true">verified_user</mat-icon>
              Usa tu cuenta institucional <strong>&#64;{{ domains().join(', @') }}</strong>
            </p>
          }

          @if (providers().devLogin) {
            <details class="dev">
              <summary>Acceso de desarrollo</summary>
              <form (ngSubmit)="devLogin()" class="dev-form">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Correo</mat-label>
                  <input matInput type="email" name="email" [(ngModel)]="devEmail" required autocomplete="email" />
                </mat-form-field>
                <div class="quick">
                  <button matButton type="button" (click)="devEmail = 'paciente@uets.edu.ec'">Paciente</button>
                  <button matButton type="button" (click)="devEmail = 'doctor@uets.edu.ec'">Doctor</button>
                  <button matButton type="button" (click)="devEmail = 'admin@uets.edu.ec'">Admin</button>
                </div>
                <button matButton="tonal" type="submit" [disabled]="busy()">Entrar</button>
              </form>
            </details>
          }

          <p class="legal">
            Al continuar aceptas el tratamiento de tus datos personales conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.
          </p>
        </div>
      </main>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1.1fr 1fr;
    }
    @media (max-width: 900px) {
      .wrap {
        grid-template-columns: 1fr;
      }
      .hero {
        display: none;
      }
    }
    .hero {
      background:
        radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--mat-sys-tertiary) 35%, transparent), transparent 55%),
        linear-gradient(145deg, #00504f, #006a6a 55%, #0b5394);
      color: #fff;
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .hero-inner {
      max-width: 440px;
      h2 {
        font: var(--mat-sys-display-small);
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 24px 0 32px;
      }
      ol {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      li {
        display: flex;
        align-items: center;
        gap: 14px;
        font: var(--mat-sys-title-medium);
        opacity: 0.95;
      }
      li mat-icon {
        background: rgb(255 255 255 / 0.16);
        border-radius: 12px;
        padding: 8px;
        width: 40px;
        height: 40px;
        box-sizing: border-box;
      }
    }
    .logo {
      width: 64px;
      height: 64px;
      border-radius: 20px;
      display: grid;
      place-items: center;
      background: rgb(255 255 255 / 0.18);
      mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
      }
    }
    .logo.small {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      width: 56px;
      height: 56px;
      margin: 0 auto 16px;
    }
    .panel {
      display: grid;
      place-items: center;
      padding: 24px 16px;
    }
    .card {
      width: 100%;
      max-width: 420px;
      text-align: center;
      h1 {
        font: var(--mat-sys-headline-small);
        font-weight: 700;
        margin: 0;
      }
      .sub {
        color: var(--mat-sys-on-surface-variant);
        margin: 8px 0 28px;
      }
    }
    .google-btn {
      width: 100%;
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      border-radius: 28px;
      border: 1px solid var(--mat-sys-outline);
      background: var(--mat-sys-surface-container-lowest);
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-title-medium);
      cursor: pointer;
      transition: background 0.15s, box-shadow 0.15s;
    }
    .google-btn:hover:not(:disabled) {
      background: var(--mat-sys-surface-container);
      box-shadow: var(--mat-sys-level1);
    }
    .google-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .hint {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }
    .alert {
      display: flex;
      gap: 10px;
      text-align: left;
      align-items: flex-start;
      padding: 12px 16px;
      border-radius: 12px;
      margin-bottom: 20px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font: var(--mat-sys-body-medium);
    }
    .alert.info {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .dev {
      margin-top: 24px;
      text-align: left;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 8px 16px;
      summary {
        cursor: pointer;
        font: var(--mat-sys-label-large);
        color: var(--mat-sys-on-surface-variant);
        padding: 4px 0;
      }
    }
    .dev-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 0;
    }
    .quick {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .legal {
      margin-top: 32px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  /** Query params vinculados por el router. */
  readonly error = input<string>();
  readonly expired = input<string>();
  readonly returnUrl = input<string>();

  protected readonly providers = signal({ google: false, devLogin: false });
  protected readonly providersLoaded = signal(false);
  protected readonly clinicName = signal('Citas Médicas y Odontológicas');
  protected readonly domains = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly localError = signal<string | null>(null);
  protected readonly errorMessage = computed(() => this.localError() ?? (this.error() ? (LOGIN_ERRORS[this.error()!] ?? LOGIN_ERRORS['oauth']) : null));
  protected devEmail = 'paciente@uets.edu.ec';

  ngOnInit(): void {
    this.auth
      .providers()
      .then((p) => this.providers.set(p))
      .catch(() => undefined)
      .finally(() => this.providersLoaded.set(true));
    this.api.publicSettings().subscribe({
      next: (s) => {
        this.clinicName.set(s.clinicName);
        this.domains.set(s.allowedDomains);
      },
      error: () => undefined,
    });
  }

  protected google() {
    this.busy.set(true);
    this.auth.loginWithGoogle();
  }

  protected async devLogin() {
    this.busy.set(true);
    this.localError.set(null);
    try {
      const u = await this.auth.devLogin(this.devEmail);
      await this.router.navigateByUrl(u.consentAt ? (this.returnUrl() ?? HOME_BY_ROLE[u.role]) : '/consentimiento');
    } catch (e) {
      this.localError.set(apiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
