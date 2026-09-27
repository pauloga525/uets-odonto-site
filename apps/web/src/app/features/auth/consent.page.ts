import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';

/** Aviso de privacidad y consentimiento (LOPDP Ecuador) en el primer ingreso. */
@Component({
  selector: 'app-consent-page',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <article class="card">
        <div class="icon" aria-hidden="true"><mat-icon>shield_person</mat-icon></div>
        <h1>Tu información está protegida</h1>
        <p class="lead">Hola {{ auth.user()?.name }}, antes de continuar revisa cómo usamos tus datos.</p>

        <ul>
          <li>
            <mat-icon aria-hidden="true">badge</mat-icon>
            <div><strong>Qué datos usamos:</strong> nombre, correo institucional y foto de tu cuenta de Google, y la información de tus citas.</div>
          </li>
          <li>
            <mat-icon aria-hidden="true">medical_information</mat-icon>
            <div><strong>Para qué:</strong> gestionar tus citas médicas u odontológicas y el historial de atención. No se usan con otros fines.</div>
          </li>
          <li>
            <mat-icon aria-hidden="true">lock</mat-icon>
            <div><strong>Cómo los protegemos:</strong> conexión cifrada, acceso restringido por rol y observaciones clínicas cifradas. Solo el personal de salud autorizado las consulta.</div>
          </li>
          <li>
            <mat-icon aria-hidden="true">gavel</mat-icon>
            <div><strong>Tus derechos:</strong> puedes solicitar acceso, rectificación o eliminación de tus datos al administrador, según la Ley Orgánica de Protección de Datos Personales.</div>
          </li>
        </ul>

        <mat-checkbox [(ngModel)]="accepted" name="accepted">He leído y acepto el tratamiento de mis datos personales.</mat-checkbox>

        <div class="actions">
          <button matButton (click)="auth.logout()">Salir</button>
          <button matButton="filled" class="btn-lg" [disabled]="!accepted || busy()" (click)="accept()">Aceptar y continuar</button>
        </div>
      </article>
    </main>
  `,
  styles: `
    .wrap {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px 16px;
    }
    .card {
      max-width: 620px;
      width: 100%;
      background: var(--mat-sys-surface-container-lowest);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 28px;
      padding: 32px 28px;
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    h1 {
      font: var(--mat-sys-headline-small);
      font-weight: 700;
      margin: 16px 0 4px;
    }
    .lead {
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 20px;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0 0 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    li {
      display: flex;
      gap: 12px;
      font: var(--mat-sys-body-medium);
      mat-icon {
        color: var(--mat-sys-primary);
        flex: 0 0 24px;
      }
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 24px;
      flex-wrap: wrap;
    }
  `,
})
export class ConsentPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  protected accepted = false;
  protected readonly busy = signal(false);

  protected async accept() {
    this.busy.set(true);
    try {
      await this.auth.acceptConsent();
      await this.router.navigateByUrl(this.auth.homeUrl());
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
