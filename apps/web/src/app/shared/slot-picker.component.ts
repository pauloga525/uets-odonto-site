import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { CalendarDayDto, SlotDto, SlotRef } from '@odonto/shared';
import { ApiService } from '../core/api.service';
import { longDate, relativeDay, today } from '../core/format';
import { NotifyService } from '../core/notify.service';
import { RealtimeService } from '../core/realtime.service';
import { EmptyStateComponent } from './empty-state.component';
import { MonthCalendarComponent } from './month-calendar.component';

interface SlotGroup {
  label: string;
  icon: string;
  slots: SlotDto[];
}

/**
 * Selector de fecha + horario reutilizable (paciente, seguimiento del doctor, reprogramación del admin).
 * Solo permite elegir horarios realmente disponibles y se actualiza en tiempo real.
 */
@Component({
  selector: 'app-slot-picker',
  imports: [MonthCalendarComponent, MatIconModule, MatProgressSpinnerModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (noAvailability()) {
      <app-empty-state
        icon="event_busy"
        title="No hay horarios disponibles"
        message="Por ahora no existen fechas con cupo. Vuelve a intentarlo más tarde o contacta al consultorio."
      />
    } @else {
      <div class="picker" [class.compact]="compact()">
        <section class="cal-pane" aria-labelledby="step-date">
          <h2 id="step-date" class="step"><span class="step-n">1</span> Elige una fecha</h2>
          @if (month()) {
            <app-month-calendar
              [month]="month()!"
              [days]="days()"
              [selected]="date()"
              [loading]="loadingCalendar()"
              [minMonth]="minMonth()"
              [maxMonth]="maxMonth()"
              (monthChange)="changeMonth($event)"
              (selectedChange)="selectDate($event)"
            />
          } @else {
            <div class="center"><mat-spinner diameter="32" /></div>
          }
        </section>

        <section class="slots-pane" aria-labelledby="step-time">
          <h2 id="step-time" class="step"><span class="step-n">2</span> Elige un horario</h2>
          @if (date()) {
            <p class="date-label">
              <strong>{{ dateLabel() }}</strong>
              <span class="rel">{{ relative() }}</span>
            </p>
            @if (conflictMessage()) {
              <div class="conflict" role="alert">
                <mat-icon aria-hidden="true">info</mat-icon>
                <span>{{ conflictMessage() }}</span>
              </div>
            }
            @if (loadingSlots()) {
              <div class="center"><mat-spinner diameter="32" /></div>
            } @else if (groups().length === 0) {
              <p class="muted">No hay horarios configurados para esta fecha.</p>
            } @else {
              <div aria-live="polite" class="sr-only">{{ freeCount() }} horarios disponibles</div>
              @for (g of groups(); track g.label) {
                <div class="group">
                  <h3><mat-icon aria-hidden="true">{{ g.icon }}</mat-icon>{{ g.label }}</h3>
                  <div class="slots" role="radiogroup" [attr.aria-label]="'Horarios de la ' + g.label.toLowerCase()">
                    @for (s of g.slots; track s.startTime) {
                      <button
                        type="button"
                        role="radio"
                        class="slot"
                        [class.selected]="value()?.startTime === s.startTime && value()?.date === s.date"
                        [class.taken]="!s.available"
                        [class.suggested]="suggested().includes(s.startTime) && s.available"
                        [disabled]="!s.available"
                        [attr.aria-checked]="value()?.startTime === s.startTime && value()?.date === s.date"
                        [attr.aria-label]="s.startTime + ' a ' + s.endTime + (s.available ? ', disponible' : ', ocupado')"
                        (click)="selectSlot(s)"
                      >
                        <span class="time">{{ s.startTime }}</span>
                        <span class="state">{{ s.available ? 'a ' + s.endTime : 'Ocupado' }}</span>
                      </button>
                    }
                  </div>
                </div>
              }
            }
          } @else {
            <p class="muted hint"><mat-icon aria-hidden="true">touch_app</mat-icon> Selecciona un día resaltado en el calendario.</p>
          }
        </section>
      </div>
    }
  `,
  styles: `
    .picker {
      display: grid;
      grid-template-columns: minmax(280px, 400px) 1fr;
      gap: 32px;
      align-items: start;
    }
    .picker.compact,
    :host-context(.mat-mdc-dialog-container) .picker {
      grid-template-columns: 1fr;
      gap: 20px;
    }
    @media (max-width: 800px) {
      .picker {
        grid-template-columns: 1fr;
        gap: 20px;
      }
    }
    .step {
      display: flex;
      align-items: center;
      gap: 10px;
      font: var(--mat-sys-title-medium);
      margin: 0 0 12px;
    }
    .step-n {
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font: var(--mat-sys-label-large);
      font-weight: 700;
    }
    .date-label {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
      margin: 0 0 12px;
      .rel {
        font: var(--mat-sys-label-medium);
        padding: 2px 8px;
        border-radius: 8px;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
    }
    .group h3 {
      display: flex;
      align-items: center;
      gap: 6px;
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
      margin: 16px 0 8px;
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .slots {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
      gap: 8px;
    }
    .slot {
      min-height: 56px;
      border-radius: 14px;
      border: 1.5px solid var(--slot-free-border);
      background: var(--mat-sys-surface-container-lowest);
      color: var(--mat-sys-on-surface);
      font: inherit;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      transition: background 0.15s, border-color 0.15s, transform 0.1s, opacity 0.3s;
    }
    .slot:hover:not(:disabled) {
      background: var(--slot-free-bg);
      border-color: var(--mat-sys-primary);
    }
    .slot:active:not(:disabled) {
      transform: scale(0.97);
    }
    .slot .time {
      font: var(--mat-sys-title-medium);
      font-weight: 600;
    }
    .slot .state {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .slot.selected {
      background: var(--mat-sys-primary);
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      .state {
        color: var(--mat-sys-on-primary);
      }
    }
    .slot.suggested {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mat-sys-tertiary) 45%, transparent);
    }
    .slot.taken {
      cursor: not-allowed;
      border-style: dashed;
      border-color: var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
      opacity: 0.6;
      .time {
        text-decoration: line-through;
        font-weight: 500;
      }
    }
    .conflict {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font: var(--mat-sys-body-medium);
      margin-bottom: 8px;
    }
    .center {
      display: grid;
      place-items: center;
      padding: 32px;
    }
    .hint {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 24px;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: var(--app-radius);
      justify-content: center;
    }
  `,
})
export class SlotPickerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly notify = inject(NotifyService);
  private readonly destroyRef = inject(DestroyRef);

  /** Horario elegido (two-way binding). */
  readonly value = model<SlotRef | null>(null);
  readonly compact = input(false);

  protected readonly month = signal<string | null>(null);
  protected readonly minMonth = signal<string | null>(null);
  protected readonly maxMonth = signal<string | null>(null);
  protected readonly days = signal<CalendarDayDto[]>([]);
  protected readonly date = signal<string | null>(null);
  protected readonly slots = signal<SlotDto[]>([]);
  protected readonly loadingCalendar = signal(false);
  protected readonly loadingSlots = signal(false);
  protected readonly noAvailability = signal(false);
  protected readonly conflictMessage = signal<string | null>(null);
  protected readonly suggested = signal<string[]>([]);
  private doctorId: number | null = null;

  protected readonly dateLabel = computed(() => (this.date() ? longDate(this.date()!) : ''));
  protected readonly relative = computed(() => (this.date() ? relativeDay(this.date()!) : ''));
  protected readonly freeCount = computed(() => this.slots().filter((s) => s.available).length);
  protected readonly groups = computed<SlotGroup[]>(() => {
    const defs: SlotGroup[] = [
      { label: 'Mañana', icon: 'wb_twilight', slots: [] },
      { label: 'Tarde', icon: 'light_mode', slots: [] },
      { label: 'Noche', icon: 'dark_mode', slots: [] },
    ];
    for (const s of this.slots()) {
      const h = Number(s.startTime.slice(0, 2));
      defs[h < 12 ? 0 : h < 18 ? 1 : 2].slots.push(s);
    }
    return defs.filter((g) => g.slots.length > 0);
  });

  ngOnInit(): void {
    this.minMonth.set(today().slice(0, 7));
    this.api.nextAvailable().subscribe({
      next: ({ date, lastDate }) => {
        this.maxMonth.set(lastDate?.slice(0, 7) ?? null);
        if (!date) {
          this.noAvailability.set(true);
          return;
        }
        // Abre directamente el primer mes con cupo y preselecciona el primer día disponible.
        this.changeMonth(date.slice(0, 7), date);
      },
      error: (e) => this.notify.error(e),
    });

    this.realtime.slotChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => {
      if (this.doctorId !== null && e.doctorId !== this.doctorId) return;
      // Actualiza contadores del calendario
      this.days.update((days) =>
        days.map((d) => (d.date === e.date ? { ...d, available: Math.max(0, d.available + (e.available ? 1 : -1)) } : d)),
      );
      if (e.date !== this.date()) return;
      this.slots.update((slots) => slots.map((s) => (s.startTime === e.startTime ? { ...s, available: e.available } : s)));
      const v = this.value();
      if (!e.available && v && v.date === e.date && v.startTime === e.startTime) {
        this.value.set(null);
        this.conflictMessage.set(`El horario de las ${e.startTime} acaba de ser reservado por otra persona. Elige otro horario.`);
      }
    });
  }

  protected changeMonth(month: string, preselect?: string): void {
    this.month.set(month);
    this.loadingCalendar.set(true);
    this.api.calendar(month).subscribe({
      next: (cal) => {
        this.doctorId = cal.doctorId;
        this.days.set(cal.days);
        this.loadingCalendar.set(false);
        this.realtime.watchMonth(cal.doctorId, month);
        const target = preselect ?? (this.date()?.startsWith(month) ? null : cal.days.find((d) => d.available > 0)?.date);
        if (target) this.selectDate(target);
      },
      error: (e) => {
        this.loadingCalendar.set(false);
        this.notify.error(e);
      },
    });
  }

  protected selectDate(date: string): void {
    this.date.set(date);
    this.conflictMessage.set(null);
    this.suggested.set([]);
    if (this.value()?.date !== date) this.value.set(null);
    this.loadSlots(date);
  }

  private loadSlots(date: string, after?: () => void): void {
    this.loadingSlots.set(true);
    this.api.daySlots(date).subscribe({
      next: (d) => {
        // Solo horarios futuros: los pasados se consultan en la agenda, no se pueden reservar.
        this.slots.set(d.slots.filter((s) => !s.past));
        this.loadingSlots.set(false);
        after?.();
      },
      error: (e) => {
        this.loadingSlots.set(false);
        this.notify.error(e);
      },
    });
  }

  protected selectSlot(s: SlotDto): void {
    if (!s.available) return;
    this.conflictMessage.set(null);
    this.suggested.set([]);
    this.value.set({ date: s.date, startTime: s.startTime });
  }

  /**
   * Llamado por el padre cuando el backend respondió 409 SLOT_TAKEN:
   * refresca sin perder la fecha elegida y resalta las alternativas más cercanas.
   */
  handleConflict(message: string): void {
    const lost = this.value();
    this.value.set(null);
    this.conflictMessage.set(message);
    const date = this.date();
    if (!date) return;
    this.loadSlots(date, () => {
      if (!lost) return;
      const target = Number(lost.startTime.slice(0, 2));
      const nearest = this.slots()
        .filter((s) => s.available)
        .sort((a, b) => Math.abs(Number(a.startTime.slice(0, 2)) - target) - Math.abs(Number(b.startTime.slice(0, 2)) - target))
        .slice(0, 2)
        .map((s) => s.startTime);
      this.suggested.set(nearest);
    });
    if (this.month()) this.api.calendar(this.month()!).subscribe((cal) => this.days.set(cal.days));
  }
}
