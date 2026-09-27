import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import type { AppointmentDto } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { googleCalendarUrl } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { AppointmentCardComponent } from '../../shared/appointment-card.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';

type Scope = 'upcoming' | 'past' | 'cancelled';

const EMPTY: Record<Scope, { icon: string; title: string; message: string }> = {
  upcoming: { icon: 'event_available', title: 'No tienes citas próximas', message: 'Cuando reserves una cita aparecerá aquí.' },
  past: { icon: 'history', title: 'Aún no tienes historial', message: 'Tus atenciones finalizadas aparecerán aquí.' },
  cancelled: { icon: 'event_busy', title: 'No tienes citas canceladas', message: '' },
};

@Component({
  selector: 'app-my-appointments',
  imports: [MatTabsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, AppointmentCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Mis citas</h1>
          <p>Consulta el estado de tus citas.</p>
        </div>
        <a matButton="filled" routerLink="/paciente/reservar"><mat-icon>add</mat-icon>Nueva cita</a>
      </header>

      <mat-tab-group [selectedIndex]="tabIndex()" (selectedIndexChange)="changeTab($event)" mat-stretch-tabs="false" animationDuration="150ms">
        <mat-tab label="Próximas" />
        <mat-tab label="Historial" />
        <mat-tab label="Canceladas" />
      </mat-tab-group>

      <div class="list" aria-live="polite">
        @if (loading()) {
          <div class="center"><mat-spinner diameter="40" /></div>
        } @else if (items().length === 0) {
          <app-empty-state [icon]="empty().icon" [title]="empty().title" [message]="empty().message">
            @if (scope() === 'upcoming') {
              <a matButton="filled" routerLink="/paciente/reservar">Reservar cita</a>
            }
          </app-empty-state>
        } @else {
          @for (a of items(); track a.id) {
            <app-appointment-card [appointment]="a">
              @if (scope() === 'upcoming') {
                <a matButton="tonal" [href]="calendarUrl(a)" target="_blank" rel="noopener"><mat-icon>calendar_add_on</mat-icon>Calendario</a>
              }
              @if (a.status === 'RESERVADA' && scope() === 'upcoming') {
                <span class="note">Para cancelar o reprogramar, comunícate con el consultorio.</span>
              }
              @if (a.cancelReason) {
                <span class="note">Motivo: {{ a.cancelReason }}</span>
              }
            </app-appointment-card>
          }
        }
      </div>
    </div>
  `,
  styles: `
    mat-tab-group {
      margin-bottom: 16px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .center {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .note {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      align-self: center;
    }
  `,
})
export class MyAppointmentsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  private readonly scopes: Scope[] = ['upcoming', 'past', 'cancelled'];
  protected readonly scope = signal<Scope>('upcoming');
  protected readonly tabIndex = signal(0);
  protected readonly items = signal<AppointmentDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly empty = signal(EMPTY.upcoming);

  ngOnInit(): void {
    this.load();
  }

  protected changeTab(i: number) {
    this.tabIndex.set(i);
    this.scope.set(this.scopes[i]);
    this.empty.set(EMPTY[this.scopes[i]]);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.appointments({ scope: this.scope(), pageSize: 100 }).subscribe({
      next: (p) => {
        this.items.set(p.items);
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
