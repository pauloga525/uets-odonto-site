import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { STATUS_META, type AppointmentStatus } from '@odonto/shared';

/** Estado de la cita: color + icono + texto (accesible, no depende solo del color). */
@Component({
  selector: 'app-status-chip',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [class]="'chip tone-' + meta().tone" [class.compact]="compact()">
      <mat-icon aria-hidden="true">{{ meta().icon }}</mat-icon>
      <span>{{ meta().label }}</span>
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px 4px 8px;
      border-radius: 999px;
      font: var(--mat-sys-label-large);
      white-space: nowrap;
      line-height: 1;
    }
    .chip.compact {
      padding: 2px 10px 2px 6px;
      font: var(--mat-sys-label-medium);
    }
    mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .compact mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .tone-reserved { background: var(--st-reserved-bg); color: var(--st-reserved-fg); }
    .tone-started { background: var(--st-started-bg); color: var(--st-started-fg); }
    .tone-progress { background: var(--st-progress-bg); color: var(--st-progress-fg); }
    .tone-finished { background: var(--st-finished-bg); color: var(--st-finished-fg); }
    .tone-cancelled { background: var(--st-cancelled-bg); color: var(--st-cancelled-fg); }
  `,
})
export class StatusChipComponent {
  readonly status = input.required<AppointmentStatus>();
  readonly compact = input(false);
  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
