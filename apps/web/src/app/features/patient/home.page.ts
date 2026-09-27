import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import type { AppointmentDto } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { googleCalendarUrl, longDate, relativeDay } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { StatusChipComponent } from '../../shared/status-chip.component';

@Component({
  selector: 'app-patient-home',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="greet">
        <p class="muted">{{ greeting() }},</p>
        <h1>{{ firstName() }}</h1>
      </header>

      @if (loading()) {
        <div class="center"><mat-spinner diameter="40" /></div>
      } @else if (next(); as a) {
        <section class="hero" aria-labelledby="next-title">
          <div class="hero-top">
            <span id="next-title" class="eyebrow"><mat-icon aria-hidden="true">event_upcoming</mat-icon>Tu próxima cita</span>
            <app-status-chip [status]="a.status" [compact]="true" />
          </div>
          <div class="when">
            <span class="rel">{{ relative(a.date) }}</span>
            <span class="date">{{ longDate(a.date) }}</span>
            <span class="time">{{ a.startTime }} – {{ a.endTime }}</span>
          </div>
          <div class="where"><mat-icon aria-hidden="true">stethoscope</mat-icon>{{ a.doctor.displayName }}</div>
          <div class="hero-actions">
            <a matButton="tonal" [href]="calendarUrl(a)" target="_blank" rel="noopener">
              <mat-icon>calendar_add_on</mat-icon>Agregar a mi calendario
            </a>
          </div>
          <p class="hero-note"><mat-icon aria-hidden="true">info</mat-icon>¿No puedes asistir? Comunícate con el consultorio para cancelar o reprogramar.</p>
        </section>
      } @else {
        <section class="hero empty">
          <mat-icon class="big" aria-hidden="true">calendar_add_on</mat-icon>
          <h2>No tienes citas próximas</h2>
          <p>Reserva tu cita médica u odontológica en menos de un minuto.</p>
          <a matButton="filled" class="btn-lg cta" routerLink="/paciente/reservar"><mat-icon>add</mat-icon>Reservar cita</a>
        </section>
      }

      <div class="grid grid-2 quick">
        <a class="tile" routerLink="/paciente/reservar">
          <span class="tile-icon"><mat-icon aria-hidden="true">add_circle</mat-icon></span>
          <span><strong>Reservar cita</strong><small>Consulta fechas y horarios libres</small></span>
          <mat-icon aria-hidden="true">chevron_right</mat-icon>
        </a>
        <a class="tile" routerLink="/paciente/mis-citas">
          <span class="tile-icon alt"><mat-icon aria-hidden="true">event_note</mat-icon></span>
          <span><strong>Mis citas</strong><small>Próximas, historial y canceladas</small></span>
          <mat-icon aria-hidden="true">chevron_right</mat-icon>
        </a>
      </div>

      <section class="tips surface">
        <h2 class="section-title"><mat-icon aria-hidden="true">tips_and_updates</mat-icon>Antes de tu cita</h2>
        <ul>
          <li>Llega 10 minutos antes de tu horario.</li>
          <li>Cada cita dura 1 hora.</li>
          <li>Si no puedes asistir, avisa al consultorio con anticipación para que liberen el horario a otra persona.</li>
        </ul>
      </section>
    </div>
  `,
  styles: `
    .greet {
      margin-bottom: 20px;
      p {
        margin: 0;
      }
      h1 {
        margin: 0;
        font: var(--mat-sys-headline-medium);
        font-weight: 700;
      }
    }
    .center {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .hero {
      border-radius: 28px;
      padding: 24px;
      color: #fff;
      background:
        radial-gradient(circle at 90% 10%, rgb(255 255 255 / 0.18), transparent 45%),
        linear-gradient(135deg, #00504f, #006a6a 60%, #0b5394);
      margin-bottom: 20px;
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 6px;
      font: var(--mat-sys-label-large);
      opacity: 0.9;
    }
    .when {
      display: flex;
      flex-direction: column;
      margin: 16px 0 8px;
      .rel {
        font: var(--mat-sys-label-large);
        opacity: 0.85;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .date {
        font: var(--mat-sys-headline-small);
        font-weight: 700;
      }
      .time {
        font: var(--mat-sys-display-small);
        font-weight: 700;
        letter-spacing: -0.02em;
      }
    }
    .where {
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0.9;
    }
    .hero-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 20px;
    }
    .hero-note {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 16px 0 0;
      font: var(--mat-sys-body-small);
      opacity: 0.9;
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .hero.empty {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      h2 {
        margin: 8px 0 4px;
        font: var(--mat-sys-headline-small);
        font-weight: 700;
      }
      p {
        margin: 0 0 20px;
        opacity: 0.9;
      }
      .big {
        font-size: 48px;
        width: 48px;
        height: 48px;
      }
      .cta {
        --mat-button-filled-container-color: #fff;
        --mat-button-filled-label-text-color: #00504f;
      }
    }
    .quick {
      margin-bottom: 20px;
    }
    .tile {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px;
      min-height: 76px;
      border-radius: var(--app-radius);
      background: var(--mat-sys-surface-container-lowest);
      border: 1px solid var(--mat-sys-outline-variant);
      color: inherit;
      text-decoration: none;
      transition: background 0.15s, transform 0.1s;
      > span:nth-child(2) {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      small {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
    }
    .tile:hover {
      background: var(--mat-sys-surface-container);
    }
    .tile-icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .tile-icon.alt {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .tips ul {
      margin: 0;
      padding-left: 20px;
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.7;
    }
  `,
})
export class PatientHomePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  protected readonly loading = signal(true);
  protected readonly next = signal<AppointmentDto | null>(null);
  protected readonly firstName = computed(() => this.auth.user()?.name.split(' ')[0] ?? '');
  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  });
  protected readonly longDate = longDate;
  protected readonly relative = relativeDay;

  ngOnInit(): void {
    this.load();
  }

  private load() {
    this.api.appointments({ scope: 'upcoming', pageSize: 1 }).subscribe({
      next: (p) => {
        this.next.set(p.items[0] ?? null);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
  }

  protected calendarUrl(a: AppointmentDto) {
    return googleCalendarUrl({ ...a, title: `Cita — ${a.doctor.displayName}`, location: 'Consultorio UETS' });
  }
}
