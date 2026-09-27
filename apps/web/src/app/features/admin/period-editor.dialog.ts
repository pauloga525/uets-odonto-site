import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { periodSchema, type PeriodDto, type PeriodInput, type PreviewDto } from '@odonto/shared';
import { debounceTime, of, switchMap, catchError } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { mediumDate } from '../../core/format';
import { NotifyService, apiError } from '../../core/notify.service';

const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`); // 06:00 … 22:00
const WEEKDAYS = [
  { v: 1, l: 'L', full: 'Lunes' },
  { v: 2, l: 'M', full: 'Martes' },
  { v: 3, l: 'X', full: 'Miércoles' },
  { v: 4, l: 'J', full: 'Jueves' },
  { v: 5, l: 'V', full: 'Viernes' },
  { v: 6, l: 'S', full: 'Sábado' },
  { v: 7, l: 'D', full: 'Domingo' },
];

@Component({
  selector: 'app-period-editor',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar período' : 'Nuevo período de atención' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" id="period-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" placeholder="Ej. Primer período" />
        </mat-form-field>

        <div class="two">
          <mat-form-field appearance="outline">
            <mat-label>Fecha inicial</mat-label>
            <input matInput type="date" formControlName="startDate" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Fecha final</mat-label>
            <input matInput type="date" formControlName="endDate" />
          </mat-form-field>
        </div>

        <fieldset>
          <legend>Días habilitados</legend>
          <mat-button-toggle-group formControlName="weekdays" multiple aria-label="Días habilitados" hideMultipleSelectionIndicator>
            @for (d of weekdays; track d.v) {
              <mat-button-toggle [value]="d.v" [attr.aria-label]="d.full">{{ d.l }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        </fieldset>

        <fieldset>
          <legend>Bloques horarios <span class="muted">(se generan citas de 1 hora)</span></legend>
          <div formArrayName="blocks" class="blocks">
            @for (b of blocks.controls; track $index; let i = $index) {
              <div class="block" [formGroupName]="i">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Desde</mat-label>
                  <mat-select formControlName="startTime">
                    @for (h of hours; track h) {
                      <mat-option [value]="h">{{ h }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-icon aria-hidden="true">arrow_forward</mat-icon>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Hasta</mat-label>
                  <mat-select formControlName="endTime">
                    @for (h of hours; track h) {
                      <mat-option [value]="h">{{ h }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <button matIconButton type="button" (click)="removeBlock(i)" [disabled]="blocks.length === 1" aria-label="Quitar bloque">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
          <button matButton type="button" (click)="addBlock()"><mat-icon>add</mat-icon>Agregar bloque</button>
        </fieldset>

        <mat-slide-toggle formControlName="active">Período activo (visible para reservas)</mat-slide-toggle>

        @if (validationError()) {
          <p class="error" role="alert"><mat-icon aria-hidden="true">error</mat-icon>{{ validationError() }}</p>
        }
        @if (conflicts().length) {
          <div class="error box" role="alert">
            <strong>Citas afectadas:</strong>
            <ul>
              @for (c of conflicts(); track c.id) {
                <li>#{{ c.id }} · {{ c.date }} {{ c.startTime }} · {{ c.patient }}</li>
              }
            </ul>
          </div>
        }
      </form>

      <section class="preview" aria-live="polite">
        <h3><mat-icon aria-hidden="true">preview</mat-icon>Vista previa</h3>
        @if (previewLoading()) {
          <mat-spinner diameter="24" />
        } @else if (preview(); as p) {
          <p class="total"><strong>{{ p.totalSlots }}</strong> horarios de 1 hora en <strong>{{ p.days.length }}</strong> días</p>
          <div class="days">
            @for (d of p.days.slice(0, 7); track d.date) {
              <div class="day">
                <span class="d">{{ fmt(d.date) }}</span>
                <span class="s">{{ d.slots.join(' · ') }}</span>
              </div>
            }
            @if (p.days.length > 7) {
              <p class="muted">… y {{ p.days.length - 7 }} días más con el mismo esquema.</p>
            }
          </div>
        } @else {
          <p class="muted">Completa el formulario para ver los horarios que se generarán.</p>
        }
      </section>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" type="submit" form="period-form" [disabled]="saving() || !!validationError()">
        {{ saving() ? 'Guardando…' : 'Guardar disponibilidad' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 24px;
    }
    @media (max-width: 760px) {
      mat-dialog-content {
        grid-template-columns: 1fr;
      }
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 0 0 16px;
    }
    legend {
      font: var(--mat-sys-label-large);
      margin-bottom: 8px;
    }
    .blocks {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 4px;
    }
    .block {
      display: flex;
      align-items: center;
      gap: 8px;
      mat-form-field {
        flex: 1;
      }
    }
    .error {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-medium);
    }
    .error.box {
      display: block;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      ul {
        margin: 4px 0 0;
        padding-left: 18px;
      }
    }
    .preview {
      background: var(--mat-sys-surface-container);
      border-radius: 16px;
      padding: 16px;
      align-self: start;
      h3 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px;
        font: var(--mat-sys-title-small);
      }
      .total {
        margin: 0 0 12px;
      }
    }
    .days {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .day {
      display: flex;
      flex-direction: column;
      font: var(--mat-sys-body-small);
      .d {
        font-weight: 600;
        text-transform: capitalize;
      }
      .s {
        color: var(--mat-sys-on-surface-variant);
      }
    }
  `,
})
export class PeriodEditorDialog implements OnInit {
  protected readonly data = inject<PeriodDto | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PeriodEditorDialog, PeriodDto>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly hours = HOURS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly preview = signal<PreviewDto | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly validationError = signal<string | null>(null);
  protected readonly conflicts = signal<{ id: number; date: string; startTime: string; patient: string }[]>([]);
  protected readonly fmt = mediumDate;

  protected readonly form = this.fb.nonNullable.group({
    name: this.data?.name ?? '',
    startDate: this.data?.startDate ?? '',
    endDate: this.data?.endDate ?? '',
    weekdays: [this.data?.weekdays ?? [1, 2, 3, 4, 5]],
    blocks: this.fb.array(
      (this.data?.blocks ?? [
        { startTime: '08:00', endTime: '12:00' },
        { startTime: '13:00', endTime: '17:00' },
      ]).map((b) => this.fb.nonNullable.group({ startTime: b.startTime, endTime: b.endTime })),
    ),
    active: this.data?.active ?? true,
  });

  protected get blocks() {
    return this.form.controls.blocks as FormArray;
  }

  ngOnInit(): void {
    this.form.valueChanges
      .pipe(
        debounceTime(350),
        switchMap(() => {
          const r = periodSchema.safeParse(this.form.getRawValue());
          if (!r.success) {
            this.validationError.set(this.form.dirty || this.data ? r.error.issues[0].message : null);
            this.preview.set(null);
            return of(null);
          }
          this.validationError.set(null);
          this.previewLoading.set(true);
          return this.api.preview(r.data).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((p) => {
        this.previewLoading.set(false);
        if (p) this.preview.set(p);
      });
    // Dispara la vista previa inicial
    this.form.updateValueAndValidity({ emitEvent: true });
  }

  protected addBlock() {
    const last = this.blocks.at(this.blocks.length - 1)?.value as { endTime: string } | undefined;
    const start = last?.endTime ?? '08:00';
    const endIdx = Math.min(HOURS.indexOf(start) + 4, HOURS.length - 1);
    this.blocks.push(this.fb.nonNullable.group({ startTime: start, endTime: HOURS[endIdx] }));
    this.form.markAsDirty();
  }

  protected removeBlock(i: number) {
    this.blocks.removeAt(i);
    this.form.markAsDirty();
  }

  protected save() {
    const r = periodSchema.safeParse(this.form.getRawValue());
    if (!r.success) {
      this.validationError.set(r.error.issues[0].message);
      return;
    }
    this.saving.set(true);
    this.conflicts.set([]);
    const input: PeriodInput = r.data;
    const call = this.data ? this.api.updatePeriod(this.data.id, input) : this.api.createPeriod(input);
    call.subscribe({
      next: (p) => {
        this.notify.success('Disponibilidad guardada.');
        this.ref.close(p);
      },
      error: (e) => {
        this.saving.set(false);
        const err = apiError(e);
        if (err.code === 'AVAILABILITY_IN_USE' && Array.isArray(err.details)) this.conflicts.set(err.details as never);
        this.notify.error(err.message);
      },
    });
  }
}
