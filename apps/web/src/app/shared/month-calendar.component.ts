import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { addDays, isoWeekday, monthRange, type CalendarDayDto } from '@odonto/shared';
import { longDate, monthLabel, today } from '../core/format';

interface Cell {
  date: string;
  day: number;
  available: number;
  total: number;
  isToday: boolean;
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAYS_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Calendario mensual accesible (patrón "grid" de WAI-ARIA con foco itinerante):
 * solo los días con cupo son seleccionables y muestran cuántos horarios quedan libres.
 */
@Component({
  selector: 'app-month-calendar',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cal">
      <div class="cal-head">
        <button matIconButton (click)="go(-1)" [disabled]="!canPrev()" aria-label="Mes anterior">
          <mat-icon>chevron_left</mat-icon>
        </button>
        <h3 aria-live="polite">{{ label() }}</h3>
        <button matIconButton (click)="go(1)" [disabled]="!canNext()" aria-label="Mes siguiente">
          <mat-icon>chevron_right</mat-icon>
        </button>
      </div>
      <mat-progress-bar [mode]="loading() ? 'indeterminate' : 'determinate'" [value]="0" [class.hidden]="!loading()" />

      <div class="grid" role="grid" [attr.aria-label]="'Calendario de ' + label()" (keydown)="onKey($event)">
        <div class="week" role="row">
          @for (w of weekdays; track $index) {
            <div class="wd" role="columnheader" [attr.aria-label]="weekdaysFull[$index]">{{ w }}</div>
          }
        </div>
        @for (week of weeks(); track $index) {
          <div class="week" role="row">
            @for (cell of week; track $index) {
              @if (cell) {
                <div role="gridcell" [attr.aria-selected]="cell.date === selected()">
                  <button
                    type="button"
                    class="day"
                    [attr.data-date]="cell.date"
                    [class.selected]="cell.date === selected()"
                    [class.today]="cell.isToday"
                    [class.has-slots]="cell.available > 0"
                    [class.full]="cell.total > 0 && cell.available === 0"
                    [disabled]="cell.available === 0"
                    [attr.tabindex]="cell.date === focusDate() ? 0 : -1"
                    [attr.aria-label]="ariaLabel(cell)"
                    (click)="pick(cell)"
                  >
                    <span class="num">{{ cell.day }}</span>
                    @if (cell.available > 0) {
                      <span class="count">{{ cell.available }}</span>
                    } @else if (cell.total > 0) {
                      <span class="count none">lleno</span>
                    }
                  </button>
                </div>
              } @else {
                <div role="gridcell" class="blank"></div>
              }
            }
          </div>
        }
      </div>

      <div class="legend" aria-hidden="true">
        <span><i class="dot free"></i>Con horarios libres</span>
        <span><i class="dot full"></i>Sin cupo</span>
      </div>
    </div>
  `,
  styles: `
    .cal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      h3 {
        margin: 0;
        font: var(--mat-sys-title-medium);
        font-weight: 600;
      }
    }
    mat-progress-bar {
      margin: 4px 0 8px;
      border-radius: 4px;
    }
    mat-progress-bar.hidden {
      visibility: hidden;
    }
    .week {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      margin-bottom: 4px;
    }
    .wd {
      text-align: center;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      padding: 4px 0;
    }
    .day {
      width: 100%;
      aspect-ratio: 1 / 1;
      min-height: 44px;
      max-height: 64px;
      border: 1px solid transparent;
      border-radius: 12px;
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      font: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      cursor: default;
      transition: background 0.15s, transform 0.1s;
      opacity: 0.45;
    }
    .day.has-slots {
      opacity: 1;
      cursor: pointer;
      color: var(--mat-sys-on-surface);
      background: var(--slot-free-bg);
      border-color: var(--slot-free-border);
    }
    .day.has-slots:hover {
      background: color-mix(in srgb, var(--mat-sys-primary) 16%, var(--slot-free-bg));
    }
    .day.has-slots:active {
      transform: scale(0.96);
    }
    .day.full {
      opacity: 0.7;
      text-decoration: line-through;
      text-decoration-color: var(--mat-sys-outline);
    }
    .day.today .num {
      text-decoration: underline;
      text-underline-offset: 3px;
      font-weight: 700;
    }
    .day.selected {
      background: var(--mat-sys-primary) !important;
      border-color: var(--mat-sys-primary) !important;
      color: var(--mat-sys-on-primary) !important;
    }
    .num {
      font: var(--mat-sys-title-small);
      font-weight: 600;
    }
    .count {
      font-size: 0.68rem;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 8px;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font-weight: 600;
    }
    .selected .count {
      background: var(--mat-sys-on-primary);
      color: var(--mat-sys-primary);
    }
    .count.none {
      background: transparent;
      color: inherit;
      font-weight: 500;
    }
    .legend {
      display: flex;
      gap: 16px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      margin-top: 8px;
      flex-wrap: wrap;
      span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 4px;
      display: inline-block;
    }
    .dot.free {
      background: var(--slot-free-bg);
      border: 1px solid var(--slot-free-border);
    }
    .dot.full {
      background: var(--mat-sys-surface-container-highest);
    }
  `,
})
export class MonthCalendarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly month = input.required<string>();
  readonly days = input<CalendarDayDto[]>([]);
  readonly selected = input<string | null>(null);
  readonly loading = input(false);
  readonly minMonth = input<string | null>(null);
  readonly maxMonth = input<string | null>(null);

  readonly selectedChange = output<string>();
  readonly monthChange = output<string>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdaysFull = WEEKDAYS_FULL;
  protected readonly focusDate = signal<string>('');
  protected readonly label = computed(() => monthLabel(this.month()));
  protected readonly canPrev = computed(() => !this.minMonth() || this.month() > this.minMonth()!);
  protected readonly canNext = computed(() => !this.maxMonth() || this.month() < this.maxMonth()!);

  protected readonly weeks = computed<(Cell | null)[][]>(() => {
    const { from, to } = monthRange(this.month());
    const byDate = new Map(this.days().map((d) => [d.date, d]));
    const t = today();
    const cells: (Cell | null)[] = Array(isoWeekday(from) - 1).fill(null);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const info = byDate.get(d);
      cells.push({ date: d, day: Number(d.slice(8)), available: info?.available ?? 0, total: info?.total ?? 0, isToday: d === t });
    }
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  });

  constructor() {
    // Foco itinerante: día seleccionado, o el primero con cupo, o el día 1.
    effect(() => {
      const cells = this.weeks().flat().filter((c): c is Cell => !!c);
      const sel = this.selected();
      const target = cells.find((c) => c.date === sel) ?? cells.find((c) => c.available > 0) ?? cells[0];
      this.focusDate.set(target?.date ?? '');
    });
  }

  protected ariaLabel(c: Cell): string {
    const base = longDate(c.date);
    if (c.available > 0) return `${base}, ${c.available} ${c.available === 1 ? 'horario disponible' : 'horarios disponibles'}`;
    if (c.total > 0) return `${base}, sin horarios disponibles`;
    return `${base}, sin atención`;
  }

  protected go(delta: number) {
    this.monthChange.emit(shiftMonth(this.month(), delta));
  }

  protected pick(c: Cell) {
    if (c.available === 0) return;
    this.focusDate.set(c.date);
    this.selectedChange.emit(c.date);
  }

  protected onKey(e: KeyboardEvent) {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = deltas[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const { from, to } = monthRange(this.month());
    const enabled = new Set(this.weeks().flat().filter((c): c is Cell => !!c && c.available > 0).map((c) => c.date));
    // Salta los días sin cupo (no enfocables) en la dirección de la tecla.
    let next = this.focusDate() || from;
    do next = addDays(next, delta);
    while (next >= from && next <= to && !enabled.has(next));
    if (next < from || next > to) return;
    this.focusDate.set(next);
    queueMicrotask(() => (this.host.nativeElement.querySelector(`[data-date="${next}"]`) as HTMLButtonElement | null)?.focus());
  }
}

export { shiftMonth };
