import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import type { AuditLogDto } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { dateTimeLabel } from '../../core/format';
import { NotifyService } from '../../core/notify.service';

/** Registro de auditoría: quién hizo qué, cuándo, desde dónde y el cambio de estado. */
@Component({
  selector: 'app-audit-page',
  imports: [MatTableModule, MatPaginatorModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Auditoría</h1>
          <p>Registro de acciones importantes realizadas en el sistema.</p>
        </div>
      </header>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="items()">
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef>Fecha / hora</th>
            <td mat-cell *matCellDef="let l" class="nowrap">{{ dt(l.createdAt) }}</td>
          </ng-container>
          <ng-container matColumnDef="user">
            <th mat-header-cell *matHeaderCellDef>Usuario</th>
            <td mat-cell *matCellDef="let l">{{ l.user?.name ?? 'Sistema' }}</td>
          </ng-container>
          <ng-container matColumnDef="action">
            <th mat-header-cell *matHeaderCellDef>Acción</th>
            <td mat-cell *matCellDef="let l"><code>{{ l.action }}</code></td>
          </ng-container>
          <ng-container matColumnDef="entity">
            <th mat-header-cell *matHeaderCellDef>Registro</th>
            <td mat-cell *matCellDef="let l">{{ entityLabel(l) }}</td>
          </ng-container>
          <ng-container matColumnDef="change">
            <th mat-header-cell *matHeaderCellDef>Cambio de estado</th>
            <td mat-cell *matCellDef="let l">{{ l.fromStatus || l.toStatus ? (l.fromStatus ?? '—') + ' → ' + (l.toStatus ?? '—') : '' }}</td>
          </ng-container>
          <ng-container matColumnDef="ip">
            <th mat-header-cell *matHeaderCellDef>IP</th>
            <td mat-cell *matCellDef="let l" class="muted">{{ l.ip }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let l; columns: columns"></tr>
        </table>
      </div>
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="50" [pageSizeOptions]="[50, 100, 200]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .nowrap {
      white-space: nowrap;
    }
    code {
      font-size: 0.8rem;
      padding: 2px 6px;
      border-radius: 6px;
      background: var(--mat-sys-surface-container);
    }
    mat-paginator {
      background: transparent;
    }
  `,
})
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly columns = ['date', 'user', 'action', 'entity', 'change', 'ip'];
  protected readonly items = signal<AuditLogDto[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(50);
  protected readonly loading = signal(false);
  protected readonly dt = dateTimeLabel;

  ngOnInit(): void {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.audit({ page: this.page(), pageSize: this.pageSize() }).subscribe({
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
    this.pageSize.set(e.pageSize);
    this.load();
  }

  protected entityLabel(l: AuditLogDto): string {
    const names: Record<string, string> = {
      appointment: 'Cita',
      user: 'Usuario',
      availability_period: 'Período',
      availability_exception: 'Día no disponible',
      settings: 'Configuración',
    };
    const name = names[l.entity] ?? l.entity;
    return l.entityId && l.entity === 'appointment' ? `${name} #${l.entityId}` : name;
  }
}
