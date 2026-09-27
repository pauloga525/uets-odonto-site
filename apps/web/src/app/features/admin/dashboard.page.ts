import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import type { AppointmentDto, StatsDto } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { longDate, today } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { AppointmentCardComponent } from '../../shared/appointment-card.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';

@Component({
  selector: 'app-dashboard-page',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, MatProgressSpinnerModule, RouterLink, AppointmentCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Panel</h1>
          <p>{{ todayLabel }}</p>
        </div>
        <div class="row">
          <a matButton="outlined" routerLink="/admin/disponibilidad"><mat-icon>event_available</mat-icon>Disponibilidad</a>
          <a matButton="filled" routerLink="/admin/citas"><mat-icon>event_note</mat-icon>Gestionar citas</a>
        </div>
      </header>

      @if (!stats()) {
        <div class="center"><mat-spinner diameter="40" /></div>
      } @else {
        @let s = stats()!;
        <div class="grid grid-4 kpis">
          <div class="surface kpi">
            <span class="kpi-label"><mat-icon aria-hidden="true">today</mat-icon>Citas de hoy</span>
            <span class="kpi-value">{{ s.today.total }}</span>
            <span class="muted small">{{ s.today.finished }} finalizadas · {{ s.today.inProgress }} en atención</span>
          </div>
          <div class="surface kpi">
            <span class="kpi-label"><mat-icon aria-hidden="true">pending_actions</mat-icon>Pendientes</span>
            <span class="kpi-value">{{ s.upcoming }}</span>
            <span class="muted small">Reservadas desde hoy</span>
          </div>
          <div class="surface kpi">
            <span class="kpi-label"><mat-icon aria-hidden="true">task_alt</mat-icon>Finalizadas</span>
            <span class="kpi-value">{{ s.finishedTotal }}</span>
            <span class="muted small">Atenciones registradas</span>
          </div>
          <div class="surface kpi">
            <span class="kpi-label"><mat-icon aria-hidden="true">donut_large</mat-icon>Ocupación</span>
            @if (s.occupancy) {
              <span class="kpi-value">{{ occupancyPct() }}%</span>
              <mat-progress-bar mode="determinate" [value]="occupancyPct()" />
              <span class="muted small">{{ s.occupancy.periodName }} · {{ s.occupancy.booked }}/{{ s.occupancy.total }}</span>
            } @else {
              <span class="kpi-value">—</span>
              <span class="muted small">Sin períodos próximos</span>
            }
          </div>
        </div>
      }

      <section class="upcoming">
        <div class="row head">
          <h2 class="section-title"><mat-icon aria-hidden="true">event_upcoming</mat-icon>Próximas citas</h2>
          <span class="spacer"></span>
          <a matButton routerLink="/admin/citas">Ver todas</a>
        </div>
        @if (upcoming().length === 0) {
          <div class="surface"><app-empty-state icon="event_available" title="No hay citas próximas" /></div>
        } @else {
          <div class="grid grid-2">
            @for (a of upcoming(); track a.id) {
              <app-appointment-card [appointment]="a" [showPatient]="true">
                <a matButton="tonal" [routerLink]="['/admin/cita', a.id]">Ver detalle</a>
              </app-appointment-card>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    .center {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .kpis {
      margin-bottom: 28px;
      .kpi-value {
        font: var(--mat-sys-display-small);
        font-weight: 700;
      }
      .small {
        font: var(--mat-sys-body-small);
      }
      mat-progress-bar {
        margin: 4px 0;
        border-radius: 4px;
      }
    }
    .head {
      margin-bottom: 8px;
      .section-title {
        margin: 0;
      }
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly stats = signal<StatsDto | null>(null);
  protected readonly upcoming = signal<AppointmentDto[]>([]);
  protected readonly todayLabel = longDate(today());
  protected readonly occupancyPct = computed(() => {
    const o = this.stats()?.occupancy;
    return o && o.total ? Math.round((o.booked / o.total) * 100) : 0;
  });

  ngOnInit(): void {
    this.api.stats().subscribe({ next: (s) => this.stats.set(s), error: (e) => this.notify.error(e) });
    this.api.appointments({ scope: 'upcoming', pageSize: 6 }).subscribe({ next: (p) => this.upcoming.set(p.items), error: (e) => this.notify.error(e) });
  }
}
