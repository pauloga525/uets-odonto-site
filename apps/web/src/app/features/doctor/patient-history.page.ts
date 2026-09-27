import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import type { AppointmentDto } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { initials, longDate } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { StatusChipComponent } from '../../shared/status-chip.component';

/** Historial del paciente como línea de tiempo encadenada (cita → seguimiento). */
@Component({
  selector: 'app-patient-history',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, StatusChipComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <button matButton class="back" (click)="back()"><mat-icon>arrow_back</mat-icon>Volver</button>
      @if (!patient()) {
        <div class="center"><mat-spinner diameter="40" /></div>
      } @else {
        <header class="head surface">
          <div class="avatar" aria-hidden="true">
            @if (patient()!.avatarUrl) {
              <img [src]="patient()!.avatarUrl" alt="" referrerpolicy="no-referrer" />
            } @else {
              {{ initials(patient()!.name) }}
            }
          </div>
          <div>
            <h1>{{ patient()!.name }}</h1>
            <p class="muted">{{ patient()!.email }}</p>
          </div>
          <div class="stats">
            <span><strong>{{ items().length }}</strong> {{ items().length === 1 ? 'cita' : 'citas' }}</span>
            <span><strong>{{ finished() }}</strong> {{ finished() === 1 ? 'atención' : 'atenciones' }}</span>
          </div>
        </header>

        <h2 class="section-title"><mat-icon aria-hidden="true">history</mat-icon>Historial de atención</h2>
        @if (items().length === 0) {
          <div class="surface"><app-empty-state icon="history" title="Sin citas registradas" /></div>
        } @else {
          <ol class="timeline">
            @for (a of items(); track a.id) {
              <li [class.cancelled]="a.status === 'CANCELADA'">
                <span class="node" aria-hidden="true"></span>
                <article class="surface item">
                  <div class="top">
                    <a [routerLink]="[base(), 'cita', a.id]" class="when">{{ longDate(a.date) }} · {{ a.startTime }}</a>
                    <app-status-chip [status]="a.status" [compact]="true" />
                  </div>
                  @if (a.previousAppointmentId) {
                    <p class="link"><mat-icon aria-hidden="true">subdirectory_arrow_right</mat-icon>Seguimiento de la cita #{{ a.previousAppointmentId }}</p>
                  }
                  @if (a.observations) {
                    <div class="obs">
                      <span class="label">Observaciones</span>
                      <p>{{ a.observations }}</p>
                    </div>
                  }
                  @if (a.cancelReason) {
                    <p class="muted">Motivo de cancelación: {{ a.cancelReason }}</p>
                  }
                </article>
              </li>
            }
          </ol>
        }
      }
    </div>
  `,
  styles: `
    .back {
      margin: -8px 0 8px -8px;
    }
    .center {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 24px;
      h1 {
        margin: 0;
        font: var(--mat-sys-headline-small);
        font-weight: 700;
      }
      p {
        margin: 2px 0 0;
      }
    }
    .avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-title-large);
      font-weight: 700;
      img {
        width: 100%;
        height: 100%;
      }
    }
    .stats {
      margin-left: auto;
      display: flex;
      gap: 20px;
      color: var(--mat-sys-on-surface-variant);
      strong {
        font: var(--mat-sys-title-large);
        color: var(--mat-sys-on-surface);
        margin-right: 4px;
      }
    }
    .timeline {
      list-style: none;
      margin: 0;
      padding: 0 0 0 20px;
      border-left: 2px solid var(--mat-sys-outline-variant);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    li {
      position: relative;
    }
    .node {
      position: absolute;
      left: -28px;
      top: 22px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
      border: 3px solid var(--app-bg);
    }
    li.cancelled .node {
      background: var(--mat-sys-outline);
    }
    li.cancelled .item {
      opacity: 0.7;
    }
    .item {
      padding: 16px;
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .when {
      font: var(--mat-sys-title-medium);
      font-weight: 600;
      color: inherit;
    }
    .link {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-primary);
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .obs {
      margin-top: 12px;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      .label {
        font: var(--mat-sys-label-medium);
        color: var(--mat-sys-on-surface-variant);
      }
      p {
        margin: 4px 0 0;
        white-space: pre-wrap;
      }
    }
  `,
})
export class PatientHistoryPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  readonly patientId = input.required<string>();

  protected readonly patient = signal<AppointmentDto['patient'] | null>(null);
  protected readonly items = signal<AppointmentDto[]>([]);
  protected readonly finished = computed(() => this.items().filter((a) => a.status === 'FINALIZADA').length);
  protected readonly base = computed(() => (this.auth.role() === 'ADMIN' ? '/admin' : '/doctor'));
  protected readonly longDate = longDate;
  protected readonly initials = initials;

  constructor() {
    effect(() => {
      this.api.history(this.patientId()).subscribe({
        next: (h) => {
          this.patient.set(h.patient);
          this.items.set(h.items);
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  protected back() {
    history.back();
  }
}
