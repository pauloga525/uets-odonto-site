import { BreakpointObserver } from '@angular/cdk/layout';
import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Calendar, type EventInput } from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import timeGridPlugin from '@fullcalendar/timegrid';
import { STATUS_META, addDays, type AppointmentStatus } from '@odonto/shared';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { RealtimeService } from '../../core/realtime.service';

/** Agenda con vistas diaria, semanal, mensual y lista (móvil). Se refresca en tiempo real. */
@Component({
  selector: 'app-agenda-page',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Agenda</h1>
          <p>Haz clic en una cita para ver el detalle y gestionar la atención.</p>
        </div>
        <button matButton="tonal" (click)="goNext()"><mat-icon>fast_forward</mat-icon>Próxima cita</button>
      </header>
      <div class="legend" aria-label="Leyenda de estados">
        <span class="lg free">Disponible</span>
        @for (s of statuses; track s) {
          <span class="lg" [class]="'lg tone-' + meta[s].tone">{{ meta[s].label }}</span>
        }
      </div>
      <div class="surface cal"><div #cal></div></div>
    </div>
  `,
  styles: `
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .lg {
      padding: 4px 10px;
      border-radius: 8px;
      font: var(--mat-sys-label-medium);
    }
    .lg.free {
      background: var(--slot-free-bg);
      border: 1px solid var(--slot-free-border);
    }
    .tone-reserved { background: var(--st-reserved-bg); color: var(--st-reserved-fg); }
    .tone-started { background: var(--st-started-bg); color: var(--st-started-fg); }
    .tone-progress { background: var(--st-progress-bg); color: var(--st-progress-fg); }
    .tone-finished { background: var(--st-finished-bg); color: var(--st-finished-fg); }
    .tone-cancelled { background: var(--st-cancelled-bg); color: var(--st-cancelled-fg); }
    .cal {
      padding: 16px;
    }
    @media (max-width: 600px) {
      .cal {
        padding: 8px;
      }
    }
  `,
})
export class AgendaPage implements AfterViewInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly realtime = inject(RealtimeService);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly el = viewChild.required<ElementRef<HTMLElement>>('cal');

  protected readonly meta = STATUS_META;
  protected readonly statuses: AppointmentStatus[] = ['RESERVADA', 'INICIADA', 'EN_PROCESO', 'FINALIZADA'];
  private readonly base = computed(() => (this.auth.role() === 'ADMIN' ? '/admin' : '/doctor'));
  private calendar?: Calendar;

  ngAfterViewInit(): void {
    const mobile = this.breakpoints.isMatched('(max-width: 700px)');
    this.calendar = new Calendar(this.el().nativeElement, {
      plugins: [timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin],
      locale: esLocale,
      timeZone: 'local',
      initialView: mobile ? 'listWeek' : 'timeGridWeek',
      headerToolbar: mobile
        ? { left: 'prev,next', center: 'title', right: 'today' }
        : { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek' },
      footerToolbar: mobile ? { center: 'timeGridDay,listWeek,dayGridMonth' } : undefined,
      buttonText: { today: 'Hoy', day: 'Día', week: 'Semana', month: 'Mes', list: 'Lista' },
      slotMinTime: '07:00:00',
      slotMaxTime: '21:00:00',
      slotDuration: '01:00:00',
      allDaySlot: false,
      nowIndicator: true,
      height: 'auto',
      expandRows: true,
      firstDay: 1,
      dayMaxEvents: 4,
      noEventsText: 'No hay citas en este rango',
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      events: (info, success, failure) => {
        const from = info.startStr.slice(0, 10);
        const to = addDays(info.endStr.slice(0, 10), -1);
        const viewType = this.calendar?.view.type ?? '';
        this.api.rangeSlots(from, to).subscribe({
          next: (days) => {
            const events: EventInput[] = [];
            for (const d of days) {
              for (const s of d.slots) {
                const start = `${s.date}T${s.startTime}:00`;
                const end = `${s.date}T${s.endTime}:00`;
                if (s.appointment) {
                  events.push({
                    id: String(s.appointment.id),
                    title: `${s.appointment.patientName} · ${STATUS_META[s.appointment.status].label}`,
                    start,
                    end,
                    classNames: ['ev', `tone-${STATUS_META[s.appointment.status].tone}`],
                    extendedProps: { appointmentId: s.appointment.id },
                  });
                } else if (viewType.startsWith('timeGrid') && !s.past) {
                  events.push({ start, end, display: 'background', classNames: ['slot-free'] });
                }
              }
            }
            success(events);
          },
          error: (e) => {
            this.notify.error(e);
            failure(e);
          },
        });
      },
      eventClick: (arg) => {
        const id = arg.event.extendedProps['appointmentId'];
        if (id) void this.router.navigate([this.base(), 'cita', id]);
      },
    });
    this.calendar.render();

    this.realtime.ensureConnected();
    this.realtime.agendaChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.calendar?.refetchEvents());
    this.destroyRef.onDestroy(() => this.calendar?.destroy());
  }

  protected goNext() {
    this.api.appointments({ scope: 'upcoming', pageSize: 1 }).subscribe((p) => {
      const next = p.items[0];
      if (!next) {
        this.notify.info('No hay citas próximas.');
        return;
      }
      this.calendar?.gotoDate(next.date);
    });
  }
}
