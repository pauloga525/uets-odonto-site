import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { AppointmentDto, FinishResultDto, SlotRef } from '@odonto/shared';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { longDate } from '../../core/format';
import { NotifyService, apiError } from '../../core/notify.service';
import { SlotPickerComponent } from '../../shared/slot-picker.component';

const draftKey = (id: number) => `obs-draft-${id}`;

function readDraft(id: number): string {
  try {
    return sessionStorage.getItem(draftKey(id)) ?? '';
  } catch {
    return '';
  }
}

/**
 * Finalizar atención: observaciones + seguimiento opcional.
 * El seguimiento usa el mismo selector que el paciente, así que solo se ofrecen horarios válidos y libres.
 * El borrador de observaciones se guarda en la sesión del navegador para no perderlo por accidente.
 */
@Component({
  selector: 'app-finish-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    FormsModule,
    SlotPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Finalizar atención</h2>
    <mat-dialog-content>
      <dl class="summary">
        <div><dt>Paciente</dt><dd>{{ a.patient.name }}</dd></div>
        <div><dt>Fecha</dt><dd>{{ date }}</dd></div>
        <div><dt>Horario</dt><dd>{{ a.startTime }} – {{ a.endTime }}</dd></div>
      </dl>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Observaciones</mat-label>
        <textarea
          matInput
          rows="5"
          maxlength="5000"
          [ngModel]="observations()"
          (ngModelChange)="setObservations($event)"
          placeholder="Diagnóstico, procedimiento realizado, indicaciones…"
          cdkFocusInitial
        ></textarea>
        <mat-hint align="start">Se guardan cifradas. Solo el personal de salud puede verlas.</mat-hint>
        <mat-hint align="end">{{ observations().length }}/5000</mat-hint>
      </mat-form-field>

      <div class="toggle">
        <mat-slide-toggle [ngModel]="needsFollowUp()" (ngModelChange)="needsFollowUp.set($event)">¿Requiere nueva cita?</mat-slide-toggle>
      </div>

      @if (needsFollowUp()) {
        <div class="followup">
          <app-slot-picker [(value)]="followUp" [compact]="true" />
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close [disabled]="saving()">Cancelar</button>
      <button matButton="filled" (click)="submit()" [disabled]="saving() || (needsFollowUp() && !followUp())">
        @if (saving()) {
          <mat-spinner diameter="18" />
        } @else {
          <mat-icon>task_alt</mat-icon>
        }
        {{ needsFollowUp() ? 'Finalizar y agendar seguimiento' : 'Finalizar atención' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 0 0 20px;
      padding: 14px 16px;
      border-radius: 14px;
      background: var(--mat-sys-surface-container);
      dt {
        font: var(--mat-sys-label-medium);
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 2px 0 0;
        font-weight: 600;
      }
    }
    .toggle {
      margin: 12px 0;
    }
    .followup {
      margin-top: 8px;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
    }
    mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }
  `,
})
export class FinishDialogComponent {
  protected readonly a = inject<AppointmentDto>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<FinishDialogComponent, FinishResultDto>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly picker = viewChild(SlotPickerComponent);

  protected readonly date = longDate(this.a.date);
  protected readonly observations = signal(readDraft(this.a.id));
  protected readonly needsFollowUp = signal(false);
  protected readonly followUp = signal<SlotRef | null>(null);
  protected readonly saving = signal(false);

  protected setObservations(v: string) {
    this.observations.set(v);
    try {
      sessionStorage.setItem(draftKey(this.a.id), v);
    } catch {
      /* almacenamiento no disponible */
    }
  }

  protected submit() {
    this.saving.set(true);
    this.api
      .finish(this.a.id, { observations: this.observations(), followUp: this.needsFollowUp() ? (this.followUp() ?? undefined) : undefined })
      .subscribe({
        next: (res) => {
          try {
            sessionStorage.removeItem(draftKey(this.a.id));
          } catch {
            /* noop */
          }
          this.notify.success(
            res.followUp
              ? `Atención finalizada. Seguimiento agendado para ${longDate(res.followUp.date)} a las ${res.followUp.startTime}.`
              : 'Atención finalizada.',
          );
          this.ref.close(res);
        },
        error: (e) => {
          this.saving.set(false);
          const err = apiError(e);
          if (err.code === 'SLOT_TAKEN' || err.code === 'OUTSIDE_AVAILABILITY') this.picker()?.handleConflict(err.message);
          this.notify.error(err.message);
        },
      });
  }
}

export function openFinishDialog(dialog: MatDialog, a: AppointmentDto): Observable<FinishResultDto | undefined> {
  return dialog
    .open<FinishDialogComponent, AppointmentDto, FinishResultDto>(FinishDialogComponent, {
      data: a,
      width: '720px',
      maxWidth: '96vw',
      maxHeight: '94vh',
      autoFocus: 'dialog',
      disableClose: true,
    })
    .afterClosed();
}

