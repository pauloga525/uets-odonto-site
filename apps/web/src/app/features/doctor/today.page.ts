import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ACTION_META, addDays, nextDoctorAction, type SlotDto } from '@odonto/shared';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { longDate, nowTime, relativeDay, today } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { RealtimeService } from '../../core/realtime.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { StatusChipComponent } from '../../shared/status-chip.component';
import { openFinishDialog } from './finish-dialog.component';

/**
 * Vista "Hoy": línea de tiempo del día con el bloque actual resaltado.
 * Cada cita tiene UN botón principal que cambia según su estado (Iniciar → En proceso → Finalizar).
 */
@Component({
  selector: 'app-today-page',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, RouterLink, StatusChipComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>{{ isToday() ? 'Hoy' : relative() }}</h1>
          <p>{{ dateLabel() }}</p>
        </div>
        <div class="nav" role="group" aria-label="Cambiar día">
          <button matIconButton (click)="shift(-1)" aria-label="Día anterior"><mat-icon>chevron_left</mat-icon></button>
          <button matButton="outlined" (click)="goToday()" [disabled]="isToday()">Hoy</button>
          <button matIconButton (click)="shift(1)" aria-label="Día siguiente"><mat-icon>chevron_right</mat-icon></button>
        </div>
      </header>

      <div class="grid grid-4 kpis">
        <div class="surface kpi"><span class="kpi-label"><mat-icon aria-hidden="true">event</mat-icon>Citas</span><span class="kpi-value">{{ counts().total }}</span></div>
        <div class="surface kpi"><span class="kpi-label"><mat-icon aria-hidden="true">pending</mat-icon>Por atender</span><span class="kpi-value">{{ counts().pending }}</span></div>
        <div class="surface kpi"><span class="kpi-label"><mat-icon aria-hidden="true">medical_services</mat-icon>En atención</span><span class="kpi-value">{{ counts().active }}</span></div>
        <div class="surface kpi"><span class="kpi-label"><mat-icon aria-hidden="true">check_circle</mat-icon>Finalizadas</span><span class="kpi-value">{{ counts().finished }}</span></div>
      </div>

      @if (loading()) {
        <div class="center"><mat-spinner diameter="40" /></div>
      } @else if (slots().length === 0) {
        <div class="surface">
          <app-empty-state icon="event_busy" title="Sin atención programada" message="No hay horarios configurados para este día.">
            @if (nextDate()) {
              <button matButton="filled" (click)="go(nextDate()!)"><mat-icon>arrow_forward</mat-icon>Ir a la próxima cita ({{ nextLabel() }})</button>
            }
          </app-empty-state>
        </div>
      } @else {
        <ol class="timeline" aria-label="Horarios del día">
          @for (s of slots(); track s.startTime) {
            <li class="row" [class.now]="isNow(s)" [class.free]="!s.appointment">
              <div class="time">
                <strong>{{ s.startTime }}</strong>
                <span>{{ s.endTime }}</span>
                @if (isNow(s)) {
                  <span class="now-badge">Ahora</span>
                }
              </div>
              @if (s.appointment; as ap) {
                <div class="card" [class]="'card tone-' + ap.status">
                  <div class="info">
                    <a class="patient" [routerLink]="[base(), 'cita', ap.id]">{{ ap.patientName }}</a>
                    <app-status-chip [status]="ap.status" [compact]="true" />
                  </div>
                  <div class="actions">
                    @if (action(ap.status); as act) {
                      <button matButton="filled" (click)="run(act, ap.id)" [disabled]="busyId() === ap.id">
                        <mat-icon>{{ actionMeta[act].icon }}</mat-icon>{{ actionMeta[act].label }}
                      </button>
                    }
                    <a matIconButton [routerLink]="[base(), 'cita', ap.id]" matTooltip="Ver detalle" aria-label="Ver detalle de la cita">
                      <mat-icon>open_in_new</mat-icon>
                    </a>
                  </div>
                </div>
              } @else {
                <div class="card empty">
                  <span>{{ s.past ? 'Sin reserva' : 'Disponible' }}</span>
                </div>
              }
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .nav {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .kpis {
      margin-bottom: 24px;
      .surface {
        padding: 16px;
      }
      .kpi-value {
        font: var(--mat-sys-headline-large);
        font-weight: 700;
      }
    }
    .center {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .timeline {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .row {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 12px;
      align-items: stretch;
    }
    .time {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      padding-top: 14px;
      strong {
        font: var(--mat-sys-title-medium);
        font-weight: 700;
      }
      span {
        font: var(--mat-sys-body-small);
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .now-badge {
      margin-top: 4px;
      padding: 2px 8px;
      border-radius: 8px;
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error) !important;
      font-weight: 700;
    }
    .card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      min-height: 68px;
      padding: 12px 12px 12px 18px;
      border-radius: var(--app-radius);
      background: var(--mat-sys-surface-container-lowest);
      border: 1px solid var(--mat-sys-outline-variant);
      border-left-width: 6px;
    }
    .card.tone-RESERVADA { border-left-color: var(--st-reserved-fg); }
    .card.tone-INICIADA { border-left-color: var(--st-started-fg); }
    .card.tone-EN_PROCESO { border-left-color: var(--st-progress-fg); background: color-mix(in srgb, var(--st-progress-bg) 35%, var(--mat-sys-surface-container-lowest)); }
    .card.tone-FINALIZADA { border-left-color: var(--st-finished-fg); }
    .card.empty {
      border-style: dashed;
      border-left-width: 1px;
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      min-height: 52px;
    }
    .row.now .card {
      box-shadow: 0 0 0 2px var(--mat-sys-error);
    }
    .info {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }
    .patient {
      font: var(--mat-sys-title-medium);
      font-weight: 600;
      color: inherit;
      text-decoration: none;
    }
    .patient:hover {
      text-decoration: underline;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  `,
})
export class TodayPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly actionMeta = ACTION_META;
  protected readonly date = signal(today());
  protected readonly slots = signal<SlotDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly busyId = signal<number | null>(null);
  protected readonly nextDate = signal<string | null>(null);
  protected readonly clock = signal(nowTime());

  protected readonly base = computed(() => (this.auth.role() === 'ADMIN' ? '/admin' : '/doctor'));
  protected readonly isToday = computed(() => this.date() === today());
  protected readonly dateLabel = computed(() => longDate(this.date()));
  protected readonly relative = computed(() => relativeDay(this.date()));
  protected readonly nextLabel = computed(() => (this.nextDate() ? longDate(this.nextDate()!) : ''));
  protected readonly counts = computed(() => {
    const appts = this.slots().filter((s) => s.appointment).map((s) => s.appointment!.status);
    return {
      total: appts.length,
      pending: appts.filter((s) => s === 'RESERVADA').length,
      active: appts.filter((s) => s === 'INICIADA' || s === 'EN_PROCESO').length,
      finished: appts.filter((s) => s === 'FINALIZADA').length,
    };
  });
  protected readonly action = nextDoctorAction;

  ngOnInit(): void {
    this.load();
    this.realtime.ensureConnected();
    this.realtime.agendaChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => {
      if (e.date === this.date()) this.load(false);
    });
    const timer = setInterval(() => this.clock.set(nowTime()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
    this.api.appointments({ scope: 'upcoming', pageSize: 1 }).subscribe((p) => this.nextDate.set(p.items[0]?.date ?? null));
  }

  private load(showSpinner = true) {
    if (showSpinner) this.loading.set(true);
    this.api.daySlots(this.date()).subscribe({
      next: (d) => {
        this.slots.set(d.slots);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
  }

  protected isNow(s: SlotDto): boolean {
    return this.isToday() && this.clock() >= s.startTime && this.clock() < s.endTime;
  }

  protected shift(days: number) {
    this.go(addDays(this.date(), days));
  }

  protected goToday() {
    this.go(today());
  }

  protected go(date: string) {
    this.date.set(date);
    this.load();
  }

  protected run(action: 'start' | 'process' | 'finish', id: number) {
    if (action === 'finish') {
      this.api.appointment(id).subscribe({
        next: (a) => openFinishDialog(this.dialog, a).subscribe((res) => res && this.load(false)),
        error: (e) => this.notify.error(e),
      });
      return;
    }
    this.busyId.set(id);
    const call: Observable<unknown> = action === 'start' ? this.api.start(id) : this.api.process(id);
    call.subscribe({
      next: () => {
        this.busyId.set(null);
        this.load(false);
      },
      error: (e) => {
        this.busyId.set(null);
        this.notify.error(e);
        this.load(false);
      },
    });
  }
}
