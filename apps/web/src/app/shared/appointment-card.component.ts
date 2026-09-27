import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { AppointmentDto } from '@odonto/shared';
import { parseDate } from '@odonto/shared';
import { relativeDay, weekdayName } from '../core/format';
import { StatusChipComponent } from './status-chip.component';

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

@Component({
  selector: 'app-appointment-card',
  imports: [MatIconModule, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [class.cancelled]="appointment().status === 'CANCELADA'">
      <div class="date-block" aria-hidden="true">
        <span class="month">{{ monthAbbr() }}</span>
        <span class="day">{{ day() }}</span>
      </div>
      <div class="body">
        <div class="top">
          <span class="weekday">{{ weekday() }} · {{ relative() }}</span>
          <app-status-chip [status]="appointment().status" [compact]="true" />
        </div>
        <div class="time">
          <mat-icon aria-hidden="true">schedule</mat-icon>
          {{ appointment().startTime }} – {{ appointment().endTime }}
        </div>
        @if (showPatient()) {
          <div class="meta"><mat-icon aria-hidden="true">person</mat-icon>{{ appointment().patient.name }}</div>
        } @else {
          <div class="meta"><mat-icon aria-hidden="true">stethoscope</mat-icon>{{ appointment().doctor.displayName }}</div>
        }
        @if (appointment().previousAppointmentId) {
          <div class="meta follow"><mat-icon aria-hidden="true">link</mat-icon>Cita de seguimiento de la #{{ appointment().previousAppointmentId }}</div>
        }
        <div class="actions"><ng-content /></div>
      </div>
    </article>
  `,
  styles: `
    .card {
      display: flex;
      gap: 16px;
      padding: 16px;
      border-radius: var(--app-radius);
      background: var(--mat-sys-surface-container-lowest);
      border: 1px solid var(--mat-sys-outline-variant);
    }
    .card.cancelled {
      opacity: 0.75;
    }
    .date-block {
      flex: 0 0 64px;
      height: 72px;
      border-radius: 14px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      .month {
        font: var(--mat-sys-label-medium);
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .day {
        font: var(--mat-sys-headline-medium);
        font-weight: 700;
        line-height: 1;
      }
    }
    .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .weekday {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .time {
      display: flex;
      align-items: center;
      gap: 6px;
      font: var(--mat-sys-title-medium);
      font-weight: 600;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .actions:empty {
      display: none;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
  `,
})
export class AppointmentCardComponent {
  readonly appointment = input.required<AppointmentDto>();
  readonly showPatient = input(false);

  protected readonly day = computed(() => Number(this.appointment().date.slice(8)));
  protected readonly monthAbbr = computed(() => MONTHS[parseDate(this.appointment().date).getUTCMonth()]);
  protected readonly weekday = computed(() => weekdayName(this.appointment().date));
  protected readonly relative = computed(() => relativeDay(this.appointment().date));
}
