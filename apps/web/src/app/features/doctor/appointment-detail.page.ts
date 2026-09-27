import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { ACTION_META, nextDoctorAction, type AppointmentDto } from '@odonto/shared';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { dateTimeLabel, initials, longDate, shortDate } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { confirmDialog } from '../../shared/confirm-dialog.component';
import { openSlotDialog } from '../../shared/slot-dialog.component';
import { StatusChipComponent } from '../../shared/status-chip.component';
import { openFinishDialog } from './finish-dialog.component';

@Component({
  selector: 'app-appointment-detail',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a matButton class="back" [routerLink]="[base(), auth.role() === 'ADMIN' ? 'citas' : 'hoy']"><mat-icon>arrow_back</mat-icon>Volver</a>

      @if (!a()) {
        <div class="center"><mat-spinner diameter="40" /></div>
      } @else {
        @let ap = a()!;
        <header class="page-header">
          <div>
            <p class="eyebrow">Cita #{{ ap.id }}</p>
            <h1>{{ longDate(ap.date) }}</h1>
            <p>{{ ap.startTime }} – {{ ap.endTime }} · {{ ap.doctor.displayName }}</p>
          </div>
          <app-status-chip [status]="ap.status" />
        </header>

        <div class="layout">
          <div class="main">
            <!-- Acción principal según el estado -->
            @if (next(); as act) {
              <section class="surface primary-action">
                <div>
                  <h2 class="section-title">Siguiente paso</h2>
                  <p class="muted">{{ hint() }}</p>
                </div>
                <button matButton="filled" class="btn-lg" (click)="run(act)" [disabled]="busy()">
                  <mat-icon>{{ actionMeta[act].icon }}</mat-icon>{{ actionMeta[act].label }}
                </button>
              </section>
            }

            <section class="surface">
              <h2 class="section-title"><mat-icon aria-hidden="true">timeline</mat-icon>Seguimiento de estados</h2>
              <ol class="steps">
                @for (st of steps(); track st.label) {
                  <li [class.done]="st.at">
                    <span class="dot" aria-hidden="true"><mat-icon>{{ st.at ? 'check' : st.icon }}</mat-icon></span>
                    <div>
                      <strong>{{ st.label }}</strong>
                      <span>{{ st.at ? dateTime(st.at) : 'Pendiente' }}</span>
                    </div>
                  </li>
                }
              </ol>
              @if (ap.status === 'CANCELADA') {
                <p class="cancel-note"><mat-icon aria-hidden="true">cancel</mat-icon>Cancelada el {{ dateTime(ap.cancelledAt) }}{{ ap.cancelReason ? ' — ' + ap.cancelReason : '' }}</p>
              }
            </section>

            <section class="surface">
              <h2 class="section-title"><mat-icon aria-hidden="true">clinical_notes</mat-icon>Observaciones</h2>
              @if (ap.observations) {
                <p class="obs">{{ ap.observations }}</p>
              } @else {
                <p class="muted">{{ ap.status === 'FINALIZADA' ? 'Sin observaciones registradas.' : 'Se registran al finalizar la atención.' }}</p>
              }
            </section>

            @if (ap.previousAppointmentId || ap.followUpIds.length) {
              <section class="surface">
                <h2 class="section-title"><mat-icon aria-hidden="true">link</mat-icon>Citas relacionadas</h2>
                <div class="row">
                  @if (ap.previousAppointmentId) {
                    <a matButton="outlined" [routerLink]="[base(), 'cita', ap.previousAppointmentId]"><mat-icon>arrow_back</mat-icon>Cita anterior #{{ ap.previousAppointmentId }}</a>
                  }
                  @for (f of ap.followUpIds; track f) {
                    <a matButton="outlined" [routerLink]="[base(), 'cita', f]"><mat-icon>arrow_forward</mat-icon>Seguimiento #{{ f }}</a>
                  }
                </div>
              </section>
            }
          </div>

          <aside class="side">
            <section class="surface patient">
              <div class="avatar" aria-hidden="true">
                @if (ap.patient.avatarUrl) {
                  <img [src]="ap.patient.avatarUrl" alt="" referrerpolicy="no-referrer" />
                } @else {
                  {{ initials(ap.patient.name) }}
                }
              </div>
              <h2>{{ ap.patient.name }}</h2>
              <a [href]="'mailto:' + ap.patient.email">{{ ap.patient.email }}</a>
              <a matButton="tonal" class="full-width" [routerLink]="[base(), 'paciente', ap.patient.id]"><mat-icon>history</mat-icon>Historial del paciente</a>
            </section>

            @if (history().length > 1) {
              <section class="surface">
                <h2 class="section-title">Últimas atenciones</h2>
                <ul class="mini-history">
                  @for (h of history().slice(0, 5); track h.id) {
                    <li [class.current]="h.id === ap.id">
                      <a [routerLink]="[base(), 'cita', h.id]">{{ shortDate(h.date) }} · {{ h.startTime }}</a>
                      <app-status-chip [status]="h.status" [compact]="true" />
                    </li>
                  }
                </ul>
              </section>
            }

            <section class="surface actions">
              <h2 class="section-title">Otras acciones</h2>
              @if (ap.status === 'FINALIZADA' || ap.status === 'EN_PROCESO') {
                <button matButton="outlined" (click)="followUp()"><mat-icon>event_repeat</mat-icon>Crear cita de seguimiento</button>
              }
              @if (ap.status === 'RESERVADA') {
                <button matButton="outlined" (click)="reschedule()"><mat-icon>edit_calendar</mat-icon>Reprogramar</button>
                <button matButton="outlined" class="danger" (click)="cancel()"><mat-icon>event_busy</mat-icon>Cancelar cita</button>
              }
              @if (ap.status === 'CANCELADA' || ap.status === 'INICIADA') {
                <p class="muted">No hay acciones disponibles.</p>
              }
            </section>
          </aside>
        </div>
      }
    </div>
  `,
  styles: `
    .back {
      margin: -8px 0 8px -8px;
    }
    .eyebrow {
      margin: 0 0 4px !important;
      font: var(--mat-sys-label-large) !important;
      color: var(--mat-sys-primary) !important;
    }
    .center {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 960px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
    .main,
    .side {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .primary-action {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      background: var(--mat-sys-primary-container);
      border-color: transparent;
      color: var(--mat-sys-on-primary-container);
      .section-title {
        margin-bottom: 4px;
      }
      p {
        margin: 0;
        color: inherit;
        opacity: 0.85;
      }
    }
    .steps {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        opacity: 0.55;
      }
      li.done {
        opacity: 1;
      }
      div {
        display: flex;
        flex-direction: column;
      }
      span:not(.dot) {
        font: var(--mat-sys-body-small);
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .dot {
      flex: 0 0 32px;
      height: 32px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--mat-sys-surface-container-highest);
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .done .dot {
      background: var(--st-finished-bg);
      color: var(--st-finished-fg);
    }
    .cancel-note {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 16px 0 0;
      color: var(--mat-sys-error);
    }
    .obs {
      white-space: pre-wrap;
      margin: 0;
      line-height: 1.6;
    }
    .patient {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 6px;
      h2 {
        margin: 8px 0 0;
        font: var(--mat-sys-title-large);
        font-weight: 600;
      }
      a[href^='mailto'] {
        font: var(--mat-sys-body-medium);
        margin-bottom: 12px;
        word-break: break-all;
      }
    }
    .avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-headline-small);
      font-weight: 700;
      img {
        width: 100%;
        height: 100%;
      }
    }
    .mini-history {
      list-style: none;
      margin: 0;
      padding: 0;
      li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      li:last-child {
        border-bottom: 0;
      }
      li.current a {
        font-weight: 700;
      }
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }
    .danger {
      --mat-button-outlined-label-text-color: var(--mat-sys-error);
    }
  `,
})
export class AppointmentDetailPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly a = signal<AppointmentDto | null>(null);
  protected readonly history = signal<AppointmentDto[]>([]);
  protected readonly busy = signal(false);
  protected readonly actionMeta = ACTION_META;
  protected readonly longDate = longDate;
  protected readonly shortDate = shortDate;
  protected readonly dateTime = dateTimeLabel;
  protected readonly initials = initials;

  protected readonly base = computed(() => (this.auth.role() === 'ADMIN' ? '/admin' : '/doctor'));
  protected readonly next = computed(() => (this.a() ? nextDoctorAction(this.a()!.status) : null));
  protected readonly hint = computed(() => {
    switch (this.a()?.status) {
      case 'RESERVADA':
        return 'Cuando el paciente llegue, inicia la atención.';
      case 'INICIADA':
        return 'Marca la consulta como en proceso cuando comiences el procedimiento.';
      case 'EN_PROCESO':
        return 'Registra las observaciones y, si hace falta, agenda una cita de seguimiento.';
      default:
        return '';
    }
  });
  protected readonly steps = computed(() => {
    const ap = this.a();
    if (!ap) return [];
    return [
      { label: 'Reservada', icon: 'event_available', at: ap.reservedAt },
      { label: 'Iniciada', icon: 'play_circle', at: ap.startedAt },
      { label: 'En proceso', icon: 'medical_services', at: ap.inProgressAt },
      { label: 'Finalizada', icon: 'check_circle', at: ap.finishedAt },
    ];
  });

  constructor() {
    effect(() => this.load(Number(this.id())));
  }

  private load(id: number) {
    this.api.appointment(id).subscribe({
      next: (a) => {
        this.a.set(a);
        this.api.history(a.patient.id).subscribe((h) => this.history.set(h.items));
      },
      error: (e) => this.notify.error(e),
    });
  }

  private reload() {
    this.load(Number(this.id()));
  }

  protected run(action: 'start' | 'process' | 'finish') {
    const ap = this.a()!;
    if (action === 'finish') {
      openFinishDialog(this.dialog, ap).subscribe((res) => res && this.reload());
      return;
    }
    this.busy.set(true);
    const call: Observable<AppointmentDto> = action === 'start' ? this.api.start(ap.id) : this.api.process(ap.id);
    call.subscribe({
      next: (a) => {
        this.busy.set(false);
        this.a.set(a);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
        this.reload();
      },
    });
  }

  protected followUp() {
    const ap = this.a()!;
    openSlotDialog(this.dialog, {
      title: 'Cita de seguimiento',
      subtitle: `Paciente: ${ap.patient.name}. Solo se muestran horarios disponibles.`,
      confirmText: 'Agendar seguimiento',
      action: (slot) => this.api.followUp(ap.id, slot),
    }).subscribe((f) => {
      if (!f) return;
      this.notify.success(`Seguimiento agendado para ${longDate(f.date)} a las ${f.startTime}.`);
      this.reload();
    });
  }

  protected reschedule() {
    const ap = this.a()!;
    openSlotDialog(this.dialog, {
      title: 'Reprogramar cita',
      subtitle: `Actual: ${longDate(ap.date)}, ${ap.startTime}. Elige el nuevo horario.`,
      confirmText: 'Reprogramar',
      action: (slot) => this.api.reschedule(ap.id, slot),
    }).subscribe((a) => {
      if (!a) return;
      this.notify.success(`Cita reprogramada para ${longDate(a.date)} a las ${a.startTime}.`);
      this.a.set(a);
    });
  }

  protected cancel() {
    const ap = this.a()!;
    confirmDialog(this.dialog, {
      title: '¿Cancelar la cita?',
      message: `${ap.patient.name} — ${longDate(ap.date)}, ${ap.startTime}. El horario quedará libre.`,
      confirmText: 'Cancelar cita',
      destructive: true,
      reasonLabel: 'Motivo',
    }).subscribe((r) => {
      if (!r?.confirmed) return;
      this.api.cancel(ap.id, r.reason).subscribe({
        next: (a) => {
          this.a.set(a);
          this.notify.success('Cita cancelada.');
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
