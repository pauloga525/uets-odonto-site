import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import type { Role, UserDto } from '@odonto/shared';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { dateTimeLabel, initials } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { confirmDialog } from '../../shared/confirm-dialog.component';

const ROLE_LABEL: Record<Role, string> = { PATIENT: 'Paciente', DOCTOR: 'Doctor', ADMIN: 'Administrador' };

@Component({
  selector: 'app-users-page',
  imports: [
    FormsModule,
    RouterLink,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Usuarios</h1>
          <p>Los pacientes se registran automáticamente al iniciar sesión con Google. Aquí puedes cambiar roles o desactivar cuentas.</p>
        </div>
      </header>

      <div class="filters surface">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
          <mat-label>Buscar</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput (input)="search$.next($any($event.target).value)" placeholder="Nombre o correo" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Rol</mat-label>
          <mat-select [ngModel]="role()" (ngModelChange)="role.set($event); page.set(1); load()">
            <mat-option [value]="null">Todos</mat-option>
            <mat-option value="PATIENT">Pacientes</mat-option>
            <mat-option value="DOCTOR">Doctores</mat-option>
            <mat-option value="ADMIN">Administradores</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="items()">
          <ng-container matColumnDef="user">
            <th mat-header-cell *matHeaderCellDef>Usuario</th>
            <td mat-cell *matCellDef="let u">
              <div class="user">
                @if (u.avatarUrl) {
                  <img [src]="u.avatarUrl" alt="" referrerpolicy="no-referrer" />
                } @else {
                  <span class="avatar">{{ initials(u.name) }}</span>
                }
                <div>
                  <strong>{{ u.name }}</strong>
                  <span>{{ u.email }}</span>
                </div>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>Rol</th>
            <td mat-cell *matCellDef="let u">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="role-select">
                <mat-select [value]="u.role" (selectionChange)="changeRole(u, $event.value)" [disabled]="u.id === me()?.id" [attr.aria-label]="'Rol de ' + u.name">
                  @for (r of roles; track r) {
                    <mat-option [value]="r">{{ roleLabel[r] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </td>
          </ng-container>
          <ng-container matColumnDef="last">
            <th mat-header-cell *matHeaderCellDef>Último acceso</th>
            <td mat-cell *matCellDef="let u" class="muted">{{ dt(u.lastLoginAt) }}</td>
          </ng-container>
          <ng-container matColumnDef="active">
            <th mat-header-cell *matHeaderCellDef>Activo</th>
            <td mat-cell *matCellDef="let u">
              <mat-slide-toggle [checked]="u.active" (change)="toggle(u, $event.checked)" [disabled]="u.id === me()?.id" [attr.aria-label]="'Cuenta activa de ' + u.name" />
            </td>
          </ng-container>
          <ng-container matColumnDef="history">
            <th mat-header-cell *matHeaderCellDef><span class="sr-only">Historial</span></th>
            <td mat-cell *matCellDef="let u">
              @if (u.role === 'PATIENT') {
                <a matButton [routerLink]="['/admin/paciente', u.id]">Historial</a>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let u; columns: columns" [class.inactive]="!u.active"></tr>
        </table>
      </div>
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="25" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .filters {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      padding: 16px;
      margin-bottom: 12px;
      .search {
        flex: 1;
        min-width: 220px;
      }
    }
    .user {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
      img,
      .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        flex: 0 0 36px;
      }
      .avatar {
        display: grid;
        place-items: center;
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
        font: var(--mat-sys-label-large);
      }
      div {
        display: flex;
        flex-direction: column;
      }
      span {
        font: var(--mat-sys-body-small);
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .role-select {
      width: 170px;
    }
    tr.inactive {
      opacity: 0.55;
    }
    mat-paginator {
      background: transparent;
    }
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly columns = ['user', 'role', 'last', 'active', 'history'];
  protected readonly roles: Role[] = ['PATIENT', 'DOCTOR', 'ADMIN'];
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly me = this.auth.user;
  protected readonly items = signal<UserDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly role = signal<Role | null>(null);
  protected readonly page = signal(1);
  protected readonly search = signal('');
  protected readonly search$ = new Subject<string>();
  protected readonly initials = initials;
  protected readonly dt = dateTimeLabel;

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
    this.api.users({ search: this.search(), role: this.role(), page: this.page(), pageSize: 25 }).subscribe({
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

  protected onPage(e: PageEvent) {
    this.page.set(e.pageIndex + 1);
    this.load();
  }

  protected changeRole(u: UserDto, role: Role) {
    confirmDialog(this.dialog, {
      title: 'Cambiar rol',
      message: `${u.name} pasará de ${ROLE_LABEL[u.role]} a ${ROLE_LABEL[role]}. El cambio aplica de inmediato.`,
      confirmText: 'Cambiar rol',
    }).subscribe((r) => {
      if (!r?.confirmed) {
        this.load();
        return;
      }
      this.api.updateUser(u.id, { role }).subscribe({
        next: () => {
          this.notify.success('Rol actualizado.');
          this.load();
        },
        error: (e) => {
          this.notify.error(e);
          this.load();
        },
      });
    });
  }

  protected toggle(u: UserDto, active: boolean) {
    this.api.updateUser(u.id, { active }).subscribe({
      next: () => {
        this.notify.success(active ? 'Cuenta activada.' : 'Cuenta desactivada. Sus sesiones fueron cerradas.');
        this.load();
      },
      error: (e) => {
        this.notify.error(e);
        this.load();
      },
    });
  }
}
