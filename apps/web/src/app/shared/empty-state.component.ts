import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" role="status">
      <div class="icon-wrap"><mat-icon aria-hidden="true">{{ icon() }}</mat-icon></div>
      <h3>{{ title() }}</h3>
      @if (message()) {
        <p>{{ message() }}</p>
      }
      <ng-content />
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 40px 16px;
      gap: 8px;
    }
    .icon-wrap {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      margin-bottom: 8px;
    }
    mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
    }
    h3 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    p {
      margin: 0 0 8px;
      max-width: 420px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class EmptyStateComponent {
  readonly icon = input('event_busy');
  readonly title = input.required<string>();
  readonly message = input<string>();
}
