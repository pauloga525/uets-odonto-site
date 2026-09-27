import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { MatBottomSheet, MatBottomSheetModule, MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import type { AppointmentDto, SlotRef } from '@odonto/shared';
import { slotEnd } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { downloadIcs, googleCalendarUrl, longDate } from '../../core/format';
import { NotifyService, apiError } from '../../core/notify.service';
import { SlotPickerComponent } from '../../shared/slot-picker.component';

/* ---------- Hoja inferior de confirmación ---------- */

@Component({
  selector: 'app-confirm-booking-sheet',
  imports: [MatButtonModule, MatIconModule, MatBottomSheetModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sheet">
      <div class="handle" aria-hidden="true"></div>
      <h2>Confirma tu cita</h2>
      <dl>
        <div><dt><mat-icon aria-hidden="true">calendar_today</mat-icon>Fecha</dt><dd>{{ date }}</dd></div>
        <div><dt><mat-icon aria-hidden="true">schedule</mat-icon>Horario</dt><dd>{{ data.startTime }} – {{ end }} <small>(1 hora)</small></dd></div>
        <div><dt><mat-icon aria-hidden="true">location_on</mat-icon>Lugar</dt><dd>Consultorio UETS</dd></div>
      </dl>
      <button matButton="filled" class="btn-lg full-width" (click)="ref.dismiss(true)" cdkFocusInitial>
        <mat-icon>check</mat-icon>Confirmar reserva
      </button>
      <button matButton class="full-width back" (click)="ref.dismiss(false)">Cambiar horario</button>
    </div>
  `,
  styles: `
    .sheet {
      padding: 8px 8px 16px;
      max-width: 520px;
      margin: 0 auto;
    }
    .handle {
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--mat-sys-outline-variant);
      margin: 0 auto 16px;
    }
    h2 {
      font: var(--mat-sys-headline-small);
      font-weight: 700;
      margin: 0 0 16px;
      text-align: center;
    }
    dl {
      margin: 0 0 24px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container);
      padding: 4px 16px;
    }
    dl > div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    dl > div:last-child {
      border-bottom: 0;
    }
    dt {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-on-surface-variant);
      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }
    dd {
      margin: 0;
      font-weight: 600;
      text-align: right;
      small {
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .back {
      margin-top: 8px;
    }
  `,
})
export class ConfirmBookingSheet {
  protected readonly data = inject<SlotRef>(MAT_BOTTOM_SHEET_DATA);
  protected readonly ref = inject(MatBottomSheetRef<ConfirmBookingSheet, boolean>);
  protected readonly date = longDate(this.data.date);
  protected readonly end = slotEnd(this.data.startTime);
}

/* ---------- Página de reserva ---------- */

@Component({
  selector: 'app-book-page',
  imports: [SlotPickerComponent, MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (booked(); as a) {
      <div class="page success" role="status" aria-live="polite">
        <div class="check" aria-hidden="true"><mat-icon>check</mat-icon></div>
        <h1>¡Cita reservada correctamente!</h1>
        <p class="when">
          <strong>{{ longDate(a.date) }}</strong><br />
          {{ a.startTime }} – {{ a.endTime }}
        </p>
        <p class="muted">Te esperamos en el Consultorio UETS con {{ a.doctor.displayName }}.</p>
        <div class="actions">
          <a matButton="tonal" [href]="calendarUrl(a)" target="_blank" rel="noopener"><mat-icon>calendar_add_on</mat-icon>Google Calendar</a>
          <button matButton="outlined" (click)="ics(a)"><mat-icon>download</mat-icon>Descargar .ics</button>
        </div>
        <a matButton="filled" class="btn-lg" routerLink="/paciente/mis-citas">Ver mis citas</a>
      </div>
    } @else {
      <div class="page">
        <header class="page-header">
          <div>
            <h1>Reservar cita</h1>
            <p>Los horarios se actualizan en tiempo real. Cada cita dura 1 hora.</p>
          </div>
        </header>

        @if (limitReached()) {
          <div class="limit" role="alert">
            <mat-icon aria-hidden="true">info</mat-icon>
            <div>
              <strong>{{ limitReached() }}</strong>
              <a routerLink="/paciente/mis-citas">Ver mis citas</a>
            </div>
          </div>
        }

        <div class="surface">
          <app-slot-picker [(value)]="selection" />
        </div>
      </div>

      @if (selection(); as s) {
        <div class="confirm-bar" role="region" aria-label="Horario seleccionado">
          <div class="summary">
            <mat-icon aria-hidden="true">event_available</mat-icon>
            <div>
              <strong>{{ longDate(s.date) }}</strong>
              <span>{{ s.startTime }} – {{ end(s.startTime) }}</span>
            </div>
          </div>
          <button matButton="filled" class="btn-lg" (click)="openConfirm(s)" [disabled]="booking()">
            @if (booking()) {
              <mat-spinner diameter="20" />
            } @else {
              Continuar
            }
          </button>
        </div>
      }
    }
  `,
  styles: `
    .limit {
      display: flex;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 14px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      margin-bottom: 16px;
      div {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      a {
        color: inherit;
        font-weight: 600;
      }
    }
    .confirm-bar {
      position: sticky;
      bottom: 16px;
      z-index: 5;
      width: calc(100% - 32px);
      max-width: calc(var(--app-max-width) - 32px);
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 12px 12px 20px;
      border-radius: 24px;
      background: var(--mat-sys-inverse-surface);
      color: var(--mat-sys-inverse-on-surface);
      box-shadow: var(--mat-sys-level3);
      animation: rise 0.2s ease-out;
      --mat-button-filled-container-color: var(--mat-sys-inverse-primary);
      --mat-button-filled-label-text-color: var(--mat-sys-on-primary-fixed);
    }
    :host-context(.mobile) .confirm-bar {
      bottom: calc(88px + env(safe-area-inset-bottom));
      margin-inline: 12px;
    }
    .summary {
      display: flex;
      align-items: center;
      gap: 12px;
      div {
        display: flex;
        flex-direction: column;
      }
      span {
        opacity: 0.85;
      }
    }
    @keyframes rise {
      from {
        transform: translateY(16px);
        opacity: 0;
      }
    }
    .success {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding-top: 48px;
      h1 {
        font: var(--mat-sys-headline-medium);
        font-weight: 700;
        margin: 16px 0 0;
      }
      .when {
        font: var(--mat-sys-title-large);
        margin: 8px 0;
      }
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
        margin: 12px 0 24px;
      }
    }
    .check {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--st-finished-bg);
      color: var(--st-finished-fg);
      animation: pop 0.45s cubic-bezier(0.2, 1.4, 0.4, 1);
      mat-icon {
        font-size: 56px;
        width: 56px;
        height: 56px;
      }
    }
    @keyframes pop {
      from {
        transform: scale(0.4);
        opacity: 0;
      }
    }
  `,
})
export class BookPage {
  private readonly api = inject(ApiService);
  private readonly sheet = inject(MatBottomSheet);
  private readonly notify = inject(NotifyService);
  private readonly picker = viewChild(SlotPickerComponent);

  protected readonly selection = signal<SlotRef | null>(null);
  protected readonly booking = signal(false);
  protected readonly booked = signal<AppointmentDto | null>(null);
  protected readonly limitReached = signal<string | null>(null);
  protected readonly longDate = longDate;
  protected readonly end = slotEnd;
  protected readonly hasSelection = computed(() => this.selection() !== null);

  protected openConfirm(slot: SlotRef) {
    this.sheet
      .open<ConfirmBookingSheet, SlotRef, boolean>(ConfirmBookingSheet, { data: slot, ariaLabel: 'Confirmar reserva' })
      .afterDismissed()
      .subscribe((ok) => ok && this.book(slot));
  }

  private book(slot: SlotRef) {
    this.booking.set(true);
    this.api.book(slot).subscribe({
      next: (a) => {
        this.booking.set(false);
        this.booked.set(a);
        window.scrollTo({ top: 0 });
      },
      error: (e) => {
        this.booking.set(false);
        const err = apiError(e);
        if (err.code === 'SLOT_TAKEN') {
          // Doble reserva: se mantiene la fecha, se refrescan horarios y se sugieren alternativas.
          this.picker()?.handleConflict(err.message);
          this.notify.error(err.message);
        } else if (err.code === 'ACTIVE_LIMIT') {
          this.limitReached.set(err.message);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (err.code === 'SLOT_IN_PAST' || err.code === 'OUTSIDE_AVAILABILITY') {
          this.picker()?.handleConflict(err.message);
        } else {
          this.notify.error(err.message);
        }
      },
    });
  }

  protected calendarUrl(a: AppointmentDto) {
    return googleCalendarUrl({ ...a, title: `Cita — ${a.doctor.displayName}`, location: 'Consultorio UETS' });
  }

  protected ics(a: AppointmentDto) {
    downloadIcs({ ...a, title: `Cita — ${a.doctor.displayName}`, location: 'Consultorio UETS' });
  }
}
