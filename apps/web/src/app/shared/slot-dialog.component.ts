import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { AppointmentDto, SlotRef } from '@odonto/shared';
import { Observable } from 'rxjs';
import { NotifyService, apiError } from '../core/notify.service';
import { SlotPickerComponent } from './slot-picker.component';

export interface SlotDialogData {
  title: string;
  subtitle?: string;
  confirmText: string;
  /** Acción a ejecutar con el horario elegido (reprogramar, seguimiento, nueva cita). */
  action: (slot: SlotRef) => Observable<AppointmentDto>;
}

/** Diálogo genérico para elegir un horario disponible y ejecutar una acción. */
@Component({
  selector: 'app-slot-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, SlotPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.subtitle) {
        <p class="muted sub">{{ data.subtitle }}</p>
      }
      <app-slot-picker [(value)]="slot" [compact]="true" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close [disabled]="saving()">Cancelar</button>
      <button matButton="filled" [disabled]="!slot() || saving()" (click)="confirm()">
        @if (saving()) {
          <mat-spinner diameter="18" />
        }
        {{ data.confirmText }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .sub {
      margin-top: 0;
    }
    mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }
  `,
})
export class SlotDialogComponent {
  protected readonly data = inject<SlotDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<SlotDialogComponent, AppointmentDto>);
  private readonly notify = inject(NotifyService);
  private readonly picker = viewChild(SlotPickerComponent);

  protected readonly slot = signal<SlotRef | null>(null);
  protected readonly saving = signal(false);

  protected confirm() {
    const s = this.slot();
    if (!s) return;
    this.saving.set(true);
    this.data.action(s).subscribe({
      next: (a) => this.ref.close(a),
      error: (e) => {
        this.saving.set(false);
        const err = apiError(e);
        if (err.code === 'SLOT_TAKEN' || err.code === 'OUTSIDE_AVAILABILITY' || err.code === 'SLOT_IN_PAST') {
          this.picker()?.handleConflict(err.message);
        }
        this.notify.error(err.message);
      },
    });
  }
}

export function openSlotDialog(dialog: MatDialog, data: SlotDialogData): Observable<AppointmentDto | undefined> {
  return dialog
    .open<SlotDialogComponent, SlotDialogData, AppointmentDto>(SlotDialogComponent, { data, width: '640px', maxWidth: '96vw', maxHeight: '94vh' })
    .afterClosed();
}
