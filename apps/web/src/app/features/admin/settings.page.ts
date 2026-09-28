import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { matchesEmailPattern, settingsSchema, type AppSettings } from '@odonto/shared';
import { ApiService, type MailStatus } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatChipsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSlideToggleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow">
      <header class="page-header">
        <div>
          <h1>Configuración</h1>
          <p>Parámetros generales del sistema.</p>
        </div>
      </header>

      @if (!model()) {
        <div class="center"><mat-spinner diameter="40" /></div>
      } @else {
        @let m = model()!;
        <form (ngSubmit)="save()" class="stack">
          <section class="surface">
            <h2 class="section-title"><mat-icon aria-hidden="true">apartment</mat-icon>Consultorio</h2>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Nombre</mat-label>
              <input matInput name="clinicName" [(ngModel)]="m.clinicName" required maxlength="150" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Ubicación</mat-label>
              <input matInput name="clinicLocation" [(ngModel)]="m.clinicLocation" maxlength="200" />
            </mat-form-field>
          </section>

          <section class="surface">
            <h2 class="section-title"><mat-icon aria-hidden="true">domain_verification</mat-icon>Dominios autorizados</h2>
            <p class="muted">Solo los correos de estos dominios pueden iniciar sesión. Si la lista está vacía, se acepta cualquier cuenta de Google.</p>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Dominios</mat-label>
              <mat-chip-grid #grid aria-label="Dominios autorizados">
                @for (d of m.allowedDomains; track d) {
                  <mat-chip-row (removed)="removeDomain(d)">
                    &#64;{{ d }}
                    <button matChipRemove [attr.aria-label]="'Quitar ' + d"><mat-icon>cancel</mat-icon></button>
                  </mat-chip-row>
                }
                <input placeholder="uets.edu.ec" [matChipInputFor]="grid" [matChipInputSeparatorKeyCodes]="separators" (matChipInputTokenEnd)="addDomain($event)" />
              </mat-chip-grid>
              <mat-hint>Presiona Enter para agregar.</mat-hint>
            </mat-form-field>

            <h3 class="sub">Cuentas bloqueadas</h3>
            <p class="muted">
              Correos que no pueden ingresar aunque su dominio esté autorizado. Use <code>*</code> para "cualquier texto".
              Ej.: <code>*.est&#64;uets.edu.ec</code> bloquea las cuentas estudiantiles.
            </p>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Patrones bloqueados</mat-label>
              <mat-chip-grid #blockedGrid aria-label="Patrones de correo bloqueados">
                @for (p of m.blockedEmailPatterns; track p) {
                  <mat-chip-row (removed)="removeBlocked(p)">
                    {{ p }}
                    <button matChipRemove [attr.aria-label]="'Quitar ' + p"><mat-icon>cancel</mat-icon></button>
                  </mat-chip-row>
                }
                <input placeholder="*.est@uets.edu.ec" [matChipInputFor]="blockedGrid" [matChipInputSeparatorKeyCodes]="separators" (matChipInputTokenEnd)="addBlocked($event)" />
              </mat-chip-grid>
            </mat-form-field>
            <div class="tester">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="grow">
                <mat-label>Probar un correo</mat-label>
                <input matInput name="testEmail" [ngModel]="testEmail()" (ngModelChange)="testEmail.set($event)" placeholder="nombre.apellido.est@uets.edu.ec" />
              </mat-form-field>
              @if (testEmail()) {
                <span class="verdict" [class.ok]="testResult().allowed">
                  <mat-icon aria-hidden="true">{{ testResult().allowed ? 'check_circle' : 'block' }}</mat-icon>{{ testResult().label }}
                </span>
              }
            </div>
          </section>

          <section class="surface">
            <h2 class="section-title"><mat-icon aria-hidden="true">rule</mat-icon>Políticas de reserva</h2>
            <p class="muted">Las cancelaciones solo las realiza el doctor o el administrador.</p>
            <div class="grid grid-2">
              <mat-form-field appearance="outline">
                <mat-label>Antelación mínima para reservar (minutos)</mat-label>
                <input matInput type="number" min="0" name="bookingLeadMinutes" [(ngModel)]="m.bookingLeadMinutes" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Máximo de citas activas por paciente</mat-label>
                <input matInput type="number" min="1" name="maxActivePerPatient" [(ngModel)]="m.maxActivePerPatient" />
              </mat-form-field>
            </div>
          </section>

          <section class="surface">
            <h2 class="section-title"><mat-icon aria-hidden="true">mail</mat-icon>Correos a pacientes</h2>
            <p class="muted">
              Al reservar, reprogramar, cancelar o agendar un seguimiento, el paciente recibe un correo con la invitación de
              calendario (recordatorios 1 día y 1 hora antes). Si la cita se reprograma o cancela, el evento se actualiza o se
              elimina de su calendario.
            </p>
            <mat-slide-toggle name="emailNotifications" [(ngModel)]="m.emailNotifications">Enviar correos a los pacientes</mat-slide-toggle>

            @if (mail(); as st) {
              <div class="mail-status" [class.off]="!st.configured">
                <mat-icon aria-hidden="true">{{ st.configured ? 'check_circle' : 'error' }}</mat-icon>
                @if (st.configured) {
                  <div>
                    <strong>Envío configurado</strong> — remitente <code>{{ st.from }}</code>
                    <span class="muted">· {{ st.sentLast24h }} enviados en 24 h · {{ st.pending }} pendientes{{ st.failed ? ' · ' + st.failed + ' fallidos' : '' }}</span>
                  </div>
                } @else {
                  <div><strong>El correo no está configurado en el servidor.</strong> Complete <code>SMTP_HOST</code>, <code>SMTP_USER</code> y <code>SMTP_PASS</code> en el archivo <code>.env</code>.</div>
                }
              </div>
              <button matButton="tonal" type="button" (click)="sendTest()" [disabled]="!st.configured || testing()">
                <mat-icon>send</mat-icon>{{ testing() ? 'Enviando…' : 'Enviar correo de prueba a mi cuenta' }}
              </button>
            }
          </section>

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <div class="row end">
            <button matButton="filled" class="btn-lg" type="submit" [disabled]="saving()">Guardar cambios</button>
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    .narrow {
      max-width: 820px;
    }
    .center {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .mail-status {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 16px 0 12px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--st-finished-bg);
      color: var(--st-finished-fg);
      font: var(--mat-sys-body-medium);
      .muted {
        color: inherit;
        opacity: 0.8;
      }
    }
    .mail-status.off {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .end {
      justify-content: flex-end;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .sub {
      font: var(--mat-sys-title-small);
      margin: 16px 0 4px;
    }
    code {
      padding: 1px 6px;
      border-radius: 6px;
      background: var(--mat-sys-surface-container);
    }
    .tester {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      .grow {
        flex: 1;
        min-width: 240px;
      }
    }
    .verdict {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-error);
    }
    .verdict.ok {
      color: var(--st-finished-fg);
    }
  `,
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly model = signal<AppSettings | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly separators = [ENTER, COMMA];
  protected readonly mail = signal<MailStatus | null>(null);
  protected readonly testing = signal(false);

  ngOnInit(): void {
    this.api.settings().subscribe({ next: (s) => this.model.set({ ...s }), error: (e) => this.notify.error(e) });
    this.loadMailStatus();
  }

  private loadMailStatus() {
    this.api.mailStatus().subscribe({ next: (s) => this.mail.set(s), error: () => this.mail.set(null) });
  }

  protected sendTest() {
    this.testing.set(true);
    this.api.testEmail().subscribe({
      next: (r) => {
        this.testing.set(false);
        this.notify.success(`Correo de prueba enviado a ${r.sentTo}. Revise su bandeja de entrada.`);
        this.loadMailStatus();
      },
      error: (e) => {
        this.testing.set(false);
        this.notify.error(e);
      },
    });
  }

  protected addDomain(e: MatChipInputEvent) {
    const v = (e.value || '').trim().toLowerCase().replace(/^@/, '');
    if (v && !this.model()!.allowedDomains.includes(v)) this.model()!.allowedDomains = [...this.model()!.allowedDomains, v];
    e.chipInput.clear();
    this.model.set({ ...this.model()! });
  }

  protected removeDomain(d: string) {
    this.model.set({ ...this.model()!, allowedDomains: this.model()!.allowedDomains.filter((x) => x !== d) });
  }

  protected addBlocked(e: MatChipInputEvent) {
    const v = (e.value || '').trim().toLowerCase();
    const m = this.model()!;
    if (v && !m.blockedEmailPatterns.includes(v)) this.model.set({ ...m, blockedEmailPatterns: [...m.blockedEmailPatterns, v] });
    e.chipInput.clear();
  }

  protected removeBlocked(p: string) {
    this.model.set({ ...this.model()!, blockedEmailPatterns: this.model()!.blockedEmailPatterns.filter((x) => x !== p) });
  }

  /** Vista previa en vivo: aplica las mismas reglas que el servidor (dominio + patrones bloqueados). */
  protected readonly testEmail = signal('');
  protected readonly testResult = computed(() => {
    const m = this.model();
    const email = this.testEmail().trim().toLowerCase();
    if (!m || !email.includes('@')) return { allowed: false, label: 'Escribe un correo completo' };
    const domain = email.split('@')[1];
    if (m.allowedDomains.length && !m.allowedDomains.includes(domain)) return { allowed: false, label: 'Rechazado: dominio no autorizado' };
    const hit = m.blockedEmailPatterns.find((p) => matchesEmailPattern(email, p));
    if (hit) return { allowed: false, label: `Bloqueado por el patrón ${hit}` };
    return { allowed: true, label: 'Puede ingresar' };
  });

  protected save() {
    const m = this.model()!;
    const r = settingsSchema.safeParse({
      ...m,
      bookingLeadMinutes: Number(m.bookingLeadMinutes),
      maxActivePerPatient: Number(m.maxActivePerPatient),
    });
    if (!r.success) {
      this.error.set(r.error.issues[0].message);
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    this.api.updateSettings(r.data).subscribe({
      next: (s) => {
        this.model.set({ ...s });
        this.saving.set(false);
        this.notify.success('Configuración guardada.');
      },
      error: (e) => {
        this.saving.set(false);
        this.notify.error(e);
      },
    });
  }
}
