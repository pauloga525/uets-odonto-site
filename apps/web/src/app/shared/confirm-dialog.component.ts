import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';

export interface ConfirmData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  destructive?: boolean;
  /** Muestra un campo de texto opcional (p. ej. motivo de cancelación). */
  reasonLabel?: string;
}

export interface ConfirmResult {
  confirmed: boolean;
  reason?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <mat-icon [class.danger]="data.destructive" aria-hidden="true">{{ data.icon ?? (data.destructive ? 'warning' : 'help') }}</mat-icon>
      <h2 mat-dialog-title>{{ data.title }}</h2>
    </div>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.reasonLabel) {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ data.reasonLabel }}</mat-label>
          <textarea matInput rows="2" maxlength="500" [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton (click)="ref.close({ confirmed: false })">{{ data.cancelText ?? 'Volver' }}</button>
      <button matButton="filled" [class.danger-btn]="data.destructive" (click)="ref.close({ confirmed: true, reason: reason() || undefined })" cdkFocusInitial>
        {{ data.confirmText ?? 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .head {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 24px;
      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
        color: var(--mat-sys-primary);
      }
      mat-icon.danger {
        color: var(--mat-sys-error);
      }
      h2 {
        text-align: center;
        padding-top: 8px;
      }
    }
    p {
      margin-top: 0;
      text-align: center;
    }
    .danger-btn {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ConfirmDialogComponent, ConfirmResult>);
  protected readonly reason = signal('');
}

export function confirmDialog(dialog: MatDialog, data: ConfirmData): Observable<ConfirmResult | undefined> {
  return dialog.open<ConfirmDialogComponent, ConfirmData, ConfirmResult>(ConfirmDialogComponent, { data, width: '440px', maxWidth: '94vw' }).afterClosed();
}
