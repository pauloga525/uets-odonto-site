import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ExceptionDto, PeriodDto } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { longDate, shortDate } from '../../core/format';
import { NotifyService, apiError } from '../../core/notify.service';
import { confirmDialog } from '../../shared/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { PeriodEditorDialog } from './period-editor.dialog';

const WD = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'];

@Component({
  selector: 'app-availability-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Disponibilidad</h1>
          <p>Configura los períodos, días y bloques horarios. Los horarios de 1 hora se generan automáticamente.</p>
        </div>
        <button matButton="filled" (click)="edit(null)"><mat-icon>add</mat-icon>Nuevo período</button>
      </header>

      @if (loading()) {
        <div class="center"><mat-spinner diameter="40" /></div>
      } @else if (periods().length === 0) {
        <div class="surface">
          <app-empty-state icon="event_available" title="Aún no hay períodos configurados" message="Crea el primer período de atención para que los pacientes puedan reservar.">
            <button matButton="filled" (click)="edit(null)">Crear período</button>
          </app-empty-state>
        </div>
      } @else {
        <div class="periods">
          @for (p of periods(); track p.id) {
            <article class="surface period" [class.inactive]="!p.active">
              <div class="p-head">
                <div>
                  <h2>{{ p.name }}</h2>
                  <p class="muted">{{ short(p.startDate) }} → {{ short(p.endDate) }}</p>
                </div>
                <span class="badge" [class.off]="!p.active">{{ p.active ? 'Activo' : 'Inactivo' }}</span>
              </div>
              <div class="wd" aria-label="Días habilitados">
                @for (d of [1, 2, 3, 4, 5, 6, 7]; track d) {
                  <span [class.on]="p.weekdays.includes(d)">{{ wd[d] }}</span>
                }
              </div>
              <div class="blocks">
                @for (b of p.blocks; track $index) {
                  <span class="block"><mat-icon aria-hidden="true">schedule</mat-icon>{{ b.startTime }} – {{ b.endTime }}</span>
                }
              </div>
              <div class="occ">
                <div class="row"><span>Ocupación</span><span class="spacer"></span><strong>{{ p.bookedCount }} / {{ p.slotCount }}</strong></div>
                <mat-progress-bar mode="determinate" [value]="p.slotCount ? (p.bookedCount / p.slotCount) * 100 : 0" />
              </div>
              <div class="p-actions">
                <button matButton (click)="edit(p)"><mat-icon>edit</mat-icon>Editar</button>
                <button matButton class="danger" (click)="remove(p)"><mat-icon>delete</mat-icon>Eliminar</button>
              </div>
            </article>
          }
        </div>
      }

      <section class="surface exceptions">
        <h2 class="section-title"><mat-icon aria-hidden="true">event_busy</mat-icon>Días no disponibles</h2>
        <p class="muted">Feriados o días en que no habrá atención aunque estén dentro de un período.</p>
        <form class="ex-form" (ngSubmit)="addException()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Fecha</mat-label>
            <input matInput type="date" name="exDate" [(ngModel)]="exDate" required />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="grow">
            <mat-label>Motivo</mat-label>
            <input matInput name="exReason" [(ngModel)]="exReason" maxlength="200" placeholder="Ej. Feriado" />
          </mat-form-field>
          <button matButton="tonal" type="submit" [disabled]="!exDate"><mat-icon>add</mat-icon>Agregar</button>
        </form>
        @if (exceptions().length) {
          <ul class="ex-list">
            @for (e of exceptions(); track e.id) {
              <li>
                <mat-icon aria-hidden="true">block</mat-icon>
                <span><strong>{{ long(e.date) }}</strong>{{ e.reason ? ' — ' + e.reason : '' }}</span>
                <span class="spacer"></span>
                <button matIconButton (click)="removeException(e)" matTooltip="Quitar" aria-label="Quitar día no disponible"><mat-icon>close</mat-icon></button>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: `
    .center {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .periods {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .period {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .period.inactive {
      opacity: 0.65;
    }
    .p-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      h2 {
        margin: 0;
        font: var(--mat-sys-title-large);
        font-weight: 600;
      }
      p {
        margin: 2px 0 0;
      }
    }
    .badge {
      padding: 4px 10px;
      border-radius: 8px;
      font: var(--mat-sys-label-medium);
      background: var(--st-finished-bg);
      color: var(--st-finished-fg);
    }
    .badge.off {
      background: var(--st-cancelled-bg);
      color: var(--st-cancelled-fg);
    }
    .wd {
      display: flex;
      gap: 4px;
      span {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font: var(--mat-sys-label-medium);
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface-variant);
        opacity: 0.6;
      }
      span.on {
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        opacity: 1;
      }
    }
    .blocks {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .block {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border-radius: 10px;
      background: var(--slot-free-bg);
      border: 1px solid var(--slot-free-border);
      font: var(--mat-sys-label-large);
      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }
    .occ {
      font: var(--mat-sys-body-small);
      .row {
        margin-bottom: 4px;
      }
    }
    .p-actions {
      display: flex;
      gap: 4px;
      margin: 0 -8px -8px;
    }
    .danger {
      --mat-button-text-label-text-color: var(--mat-sys-error);
    }
    .ex-form {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin: 12px 0;
      .grow {
        flex: 1;
        min-width: 200px;
      }
    }
    .ex-list {
      list-style: none;
      margin: 0;
      padding: 0;
      li {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      li:last-child {
        border-bottom: 0;
      }
      mat-icon {
        color: var(--mat-sys-error);
      }
    }
  `,
})
export class AvailabilityPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  protected readonly periods = signal<PeriodDto[]>([]);
  protected readonly exceptions = signal<ExceptionDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly wd = WD;
  protected readonly short = shortDate;
  protected readonly long = longDate;
  protected exDate = '';
  protected exReason = '';

  ngOnInit(): void {
    this.load();
  }

  private load() {
    this.api.periods().subscribe({
      next: (p) => {
        this.periods.set(p);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
    this.api.exceptions().subscribe((e) => this.exceptions.set(e));
  }

  protected edit(p: PeriodDto | null) {
    this.dialog
      .open(PeriodEditorDialog, { data: p, width: '900px', maxWidth: '96vw', maxHeight: '94vh' })
      .afterClosed()
      .subscribe((saved) => saved && this.load());
  }

  protected remove(p: PeriodDto) {
    confirmDialog(this.dialog, {
      title: `¿Eliminar "${p.name}"?`,
      message: p.bookedCount
        ? `Este período tiene ${p.bookedCount} cita(s). Solo se podrá eliminar si ninguna cita futura queda fuera de la disponibilidad.`
        : 'Los horarios de este período dejarán de estar disponibles para reservas.',
      confirmText: 'Eliminar',
      destructive: true,
    }).subscribe((r) => {
      if (!r?.confirmed) return;
      this.api.deletePeriod(p.id).subscribe({
        next: () => {
          this.notify.success('Período eliminado.');
          this.load();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  protected addException() {
    this.api.createException({ date: this.exDate, reason: this.exReason || undefined }).subscribe({
      next: () => {
        this.exDate = '';
        this.exReason = '';
        this.notify.success('Día no disponible agregado.');
        this.load();
      },
      error: (e) => this.notify.error(apiError(e).message),
    });
  }

  protected removeException(e: ExceptionDto) {
    this.api.deleteException(e.id).subscribe({
      next: () => this.load(),
      error: (err) => this.notify.error(err),
    });
  }
}
