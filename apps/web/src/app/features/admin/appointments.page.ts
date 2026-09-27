import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { APPOINTMENT_STATUSES, STATUS_META, type AppointmentDto, type AppointmentStatus, type SlotRef, type UserDto } from '@odonto/shared';
import { Subject, debounceTime, map, startWith, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { longDate, shortDate } from '../../core/format';
import { NotifyService, apiError } from '../../core/notify.service';
import { AppointmentCardComponent } from '../../shared/appointment-card.component';
import { confirmDialog } from '../../shared/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { openSlotDialog } from '../../shared/slot-dialog.component';
import { SlotPickerComponent } from '../../shared/slot-picker.component';
import { StatusChipComponent } from '../../shared/status-chip.component';

/* ---------- Diálogo: nueva cita para un paciente ---------- */

@Component({
  selector: 'app-new-appointment-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    SlotPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Nueva cita</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Paciente</mat-label>
        <mat-icon matPrefix>person_search</mat-icon>
        <input matInput [formControl]="search" [matAutocomplete]="auto" placeholder="Buscar por nombre o correo" />
        <mat-autocomplete #auto="matAutocomplete" [displayWith]="display" (optionSelected)="patient.set($event.option.value)">
          @for (u of results(); track u.id) {
            <mat-option [value]="u">
              <strong>{{ u.name }}</strong> <span class="muted">· {{ u.email }}</span>
            </mat-option>
          }
        </mat-autocomplete>
        <mat-hint>Solo pacientes que ya iniciaron sesión al menos una vez.</mat-hint>
      </mat-form-field>
      @if (patient()) {
        <app-slot-picker [(value)]="slot" [compact]="true" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" [disabled]="!patient() || !slot() || saving()" (click)="save()">Reservar cita</button>
    </mat-dialog-actions>
  `,
})
export class NewAppointmentDialog {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(MatDialogRef<NewAppointmentDialog, AppointmentDto>);
  private readonly picker = viewChild(SlotPickerComponent);

  protected readonly search = new FormControl<string | UserDto>('', { nonNullable: true });
  protected readonly patient = signal<UserDto | null>(null);
  protected readonly slot = signal<SlotRef | null>(null);
  protected readonly saving = signal(false);
  protected readonly results = toSignal(
    this.search.valueChanges.pipe(
      startWith(''),
      debounceTime(250),
      map((v) => (typeof v === 'string' ? v : '')),
      switchMap((q) => this.api.users({ search: q, role: 'PATIENT', pageSize: 10 })),
      map((p) => p.items.filter((u) => u.active)),
    ),
    { initialValue: [] as UserDto[] },
  );
  protected display = (u: UserDto | string | null) => (u && typeof u !== 'string' ? `${u.name} (${u.email})` : (u ?? ''));

  protected save() {
    this.saving.set(true);
    this.api.book({ ...this.slot()!, patientId: this.patient()!.id }).subscribe({
      next: (a) => this.ref.close(a),
      error: (e) => {
        this.saving.set(false);
        const err = apiError(e);
        if (err.code === 'SLOT_TAKEN') this.picker()?.handleConflict(err.message);
        this.notify.error(err.message);
      },
    });
  }
}

/* ---------- Página de gestión de citas ---------- */

type Scope = 'upcoming' | 'past' | 'cancelled' | 'all';

@Component({
  selector: 'app-appointments-page',
  imports: [
    FormsModule,
    RouterLink,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    StatusChipComponent,
    AppointmentCardComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Citas</h1>
          <p>Consulta, filtra y administra todas las citas.</p>
        </div>
        <button matButton="filled" (click)="create()"><mat-icon>add</mat-icon>Nueva cita</button>
      </header>

      <div class="filters surface">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
          <mat-label>Buscar paciente</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput [ngModel]="search()" (ngModelChange)="search$.next($event)" placeholder="Nombre o correo" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Mostrar</mat-label>
          <mat-select [ngModel]="scope()" (ngModelChange)="setScope($event)">
            <mat-option value="upcoming">Próximas</mat-option>
            <mat-option value="past">Historial</mat-option>
            <mat-option value="cancelled">Canceladas</mat-option>
            <mat-option value="all">Todas</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select [ngModel]="statuses()" (ngModelChange)="setStatuses($event)" multiple>
            @for (s of allStatuses; track s) {
              <mat-option [value]="s">{{ meta[s].label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Desde</mat-label>
          <input matInput type="date" [ngModel]="from()" (ngModelChange)="setRange($event, to())" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Hasta</mat-label>
          <input matInput type="date" [ngModel]="to()" (ngModelChange)="setRange(from(), $event)" />
        </mat-form-field>
        @if (hasFilters()) {
          <button matButton (click)="clear()"><mat-icon>filter_alt_off</mat-icon>Limpiar</button>
        }
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (!loading() && items().length === 0) {
        <div class="surface"><app-empty-state icon="search_off" title="No se encontraron citas" message="Ajusta los filtros para ver más resultados." /></div>
      } @else if (isMobile()) {
        <div class="cards">
          @for (a of items(); track a.id) {
            <app-appointment-card [appointment]="a" [showPatient]="true">
              <a matButton="tonal" [routerLink]="[base(), 'cita', a.id]">Ver detalle</a>
            </app-appointment-card>
          }
        </div>
      } @else if (items().length) {
        <div class="table-wrap">
          <table mat-table [dataSource]="items()">
            <ng-container matColumnDef="id">
              <th mat-header-cell *matHeaderCellDef>#</th>
              <td mat-cell *matCellDef="let a">{{ a.id }}</td>
            </ng-container>
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let a">{{ short(a.date) }}</td>
            </ng-container>
            <ng-container matColumnDef="time">
              <th mat-header-cell *matHeaderCellDef>Horario</th>
              <td mat-cell *matCellDef="let a">{{ a.startTime }} – {{ a.endTime }}</td>
            </ng-container>
            <ng-container matColumnDef="patient">
              <th mat-header-cell *matHeaderCellDef>Paciente</th>
              <td mat-cell *matCellDef="let a">
                <div class="pt">
                  <strong>{{ a.patient.name }}</strong>
                  <span>{{ a.patient.email }}</span>
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let a"><app-status-chip [status]="a.status" [compact]="true" /></td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="sr-only">Acciones</span></th>
              <td mat-cell *matCellDef="let a" class="actions-cell">
                <button matIconButton [matMenuTriggerFor]="menu" [attr.aria-label]="'Acciones de la cita ' + a.id" (click)="$event.stopPropagation()">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu" xPosition="before">
                  <a mat-menu-item [routerLink]="[base(), 'cita', a.id]"><mat-icon>visibility</mat-icon>Ver detalle</a>
                  <a mat-menu-item [routerLink]="[base(), 'paciente', a.patient.id]"><mat-icon>history</mat-icon>Historial del paciente</a>
                  @if (a.status === 'RESERVADA') {
                    <button mat-menu-item (click)="reschedule(a)"><mat-icon>edit_calendar</mat-icon>Reprogramar</button>
                    <button mat-menu-item (click)="cancel(a)"><mat-icon>event_busy</mat-icon>Cancelar</button>
                  }
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let a; columns: columns" class="clickable" (click)="open(a)"></tr>
          </table>
        </div>
      }
      <mat-paginator
        [length]="total()"
        [pageIndex]="page() - 1"
        [pageSize]="pageSize()"
        [pageSizeOptions]="[10, 25, 50, 100]"
        (page)="onPage($event)"
        aria-label="Paginación de citas"
      />
    </div>
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      padding: 16px;
      margin-bottom: 12px;
      mat-form-field {
        width: 160px;
      }
      .search {
        flex: 1;
        min-width: 220px;
      }
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pt {
      display: flex;
      flex-direction: column;
      span {
        font: var(--mat-sys-body-small);
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .clickable {
      cursor: pointer;
    }
    .clickable:hover {
      background: var(--mat-sys-surface-container);
    }
    .actions-cell {
      text-align: right;
      width: 56px;
    }
    mat-paginator {
      background: transparent;
      margin-top: 8px;
    }
  `,
})
export class AppointmentsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoints = inject(BreakpointObserver);

  protected readonly isMobile = toSignal(this.breakpoints.observe('(max-width: 760px)').pipe(map((r) => r.matches)), { initialValue: false });
  protected readonly columns = ['id', 'date', 'time', 'patient', 'status', 'actions'];
  protected readonly allStatuses = APPOINTMENT_STATUSES;
  protected readonly meta = STATUS_META;
  protected readonly short = shortDate;
  protected readonly base = computed(() => (this.auth.role() === 'ADMIN' ? '/admin' : '/doctor'));

  protected readonly items = signal<AppointmentDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly scope = signal<Scope>('upcoming');
  protected readonly statuses = signal<AppointmentStatus[]>([]);
  protected readonly search = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly hasFilters = computed(() => !!(this.search() || this.statuses().length || this.from() || this.to() || this.scope() !== 'upcoming'));
  protected readonly search$ = new Subject<string>();

  ngOnInit(): void {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((s) => {
      this.search.set(s);
      this.page.set(1);
      this.load();
    });
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.api
      .appointments({
        scope: this.scope(),
        status: this.statuses(),
        search: this.search(),
        from: this.from(),
        to: this.to(),
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (p) => {
          this.items.set(p.items);
          this.total.set(p.total);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.notify.error(e);
        },
      });
  }

  protected setScope(s: Scope) {
    this.scope.set(s);
    this.page.set(1);
    this.load();
  }
  protected setStatuses(s: AppointmentStatus[]) {
    this.statuses.set(s);
    this.page.set(1);
    this.load();
  }
  protected setRange(from: string, to: string) {
    this.from.set(from ?? '');
    this.to.set(to ?? '');
    this.page.set(1);
    this.load();
  }
  protected clear() {
    this.scope.set('upcoming');
    this.statuses.set([]);
    this.search.set('');
    this.from.set('');
    this.to.set('');
    this.page.set(1);
    this.load();
  }
  protected onPage(e: PageEvent) {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  protected open(a: AppointmentDto) {
    void this.router.navigate([this.base(), 'cita', a.id]);
  }

  protected create() {
    this.dialog
      .open(NewAppointmentDialog, { width: '640px', maxWidth: '96vw', maxHeight: '94vh' })
      .afterClosed()
      .subscribe((a?: AppointmentDto) => {
        if (!a) return;
        this.notify.success(`Cita reservada para ${a.patient.name}: ${longDate(a.date)}, ${a.startTime}.`);
        this.load();
      });
  }

  protected reschedule(a: AppointmentDto) {
    openSlotDialog(this.dialog, {
      title: 'Reprogramar cita',
      subtitle: `${a.patient.name} — actual: ${longDate(a.date)}, ${a.startTime}.`,
      confirmText: 'Reprogramar',
      action: (slot) => this.api.reschedule(a.id, slot),
    }).subscribe((r) => {
      if (!r) return;
      this.notify.success(`Cita reprogramada para ${longDate(r.date)}, ${r.startTime}.`);
      this.load();
    });
  }

  protected cancel(a: AppointmentDto) {
    confirmDialog(this.dialog, {
      title: '¿Cancelar la cita?',
      message: `${a.patient.name} — ${longDate(a.date)}, ${a.startTime}. El horario quedará libre.`,
      confirmText: 'Cancelar cita',
      destructive: true,
      reasonLabel: 'Motivo',
    }).subscribe((r) => {
      if (!r?.confirmed) return;
      this.api.cancel(a.id, r.reason).subscribe({
        next: () => {
          this.notify.success('Cita cancelada.');
          this.load();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
