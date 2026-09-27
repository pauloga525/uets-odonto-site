import { Routes } from '@angular/router';
import { authGuard, guestGuard, homeRedirectGuard, roleGuard, sessionGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Iniciar sesión — Citas UETS',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'consentimiento',
    canActivate: [sessionGuard],
    title: 'Protección de datos — Citas UETS',
    loadComponent: () => import('./features/auth/consent.page').then((m) => m.ConsentPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], children: [] },
      {
        path: 'paciente',
        canActivate: [roleGuard('PATIENT')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'inicio' },
          { path: 'inicio', title: 'Inicio — Citas UETS', loadComponent: () => import('./features/patient/home.page').then((m) => m.PatientHomePage) },
          { path: 'reservar', title: 'Reservar cita — Citas UETS', loadComponent: () => import('./features/patient/book.page').then((m) => m.BookPage) },
          { path: 'mis-citas', title: 'Mis citas — Citas UETS', loadComponent: () => import('./features/patient/my-appointments.page').then((m) => m.MyAppointmentsPage) },
        ],
      },
      {
        path: 'doctor',
        canActivate: [roleGuard('DOCTOR')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'hoy' },
          { path: 'hoy', title: 'Hoy — Citas UETS', loadComponent: () => import('./features/doctor/today.page').then((m) => m.TodayPage) },
          { path: 'agenda', title: 'Agenda — Citas UETS', loadComponent: () => import('./features/doctor/agenda.page').then((m) => m.AgendaPage) },
          { path: 'citas', title: 'Citas — Citas UETS', loadComponent: () => import('./features/admin/appointments.page').then((m) => m.AppointmentsPage) },
          { path: 'cita/:id', title: 'Detalle de cita — Citas UETS', loadComponent: () => import('./features/doctor/appointment-detail.page').then((m) => m.AppointmentDetailPage) },
          { path: 'paciente/:patientId', title: 'Historial — Citas UETS', loadComponent: () => import('./features/doctor/patient-history.page').then((m) => m.PatientHistoryPage) },
          { path: 'disponibilidad', title: 'Disponibilidad — Citas UETS', loadComponent: () => import('./features/admin/availability.page').then((m) => m.AvailabilityPage) },
        ],
      },
      {
        path: 'admin',
        canActivate: [roleGuard('ADMIN')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'panel' },
          { path: 'panel', title: 'Panel — Citas UETS', loadComponent: () => import('./features/admin/dashboard.page').then((m) => m.DashboardPage) },
          { path: 'agenda', title: 'Agenda — Citas UETS', loadComponent: () => import('./features/doctor/agenda.page').then((m) => m.AgendaPage) },
          { path: 'citas', title: 'Citas — Citas UETS', loadComponent: () => import('./features/admin/appointments.page').then((m) => m.AppointmentsPage) },
          { path: 'cita/:id', title: 'Detalle de cita — Citas UETS', loadComponent: () => import('./features/doctor/appointment-detail.page').then((m) => m.AppointmentDetailPage) },
          { path: 'paciente/:patientId', title: 'Historial — Citas UETS', loadComponent: () => import('./features/doctor/patient-history.page').then((m) => m.PatientHistoryPage) },
          { path: 'disponibilidad', title: 'Disponibilidad — Citas UETS', loadComponent: () => import('./features/admin/availability.page').then((m) => m.AvailabilityPage) },
          { path: 'usuarios', title: 'Usuarios — Citas UETS', loadComponent: () => import('./features/admin/users.page').then((m) => m.UsersPage) },
          { path: 'configuracion', title: 'Configuración — Citas UETS', loadComponent: () => import('./features/admin/settings.page').then((m) => m.SettingsPage) },
          { path: 'auditoria', title: 'Auditoría — Citas UETS', loadComponent: () => import('./features/admin/audit.page').then((m) => m.AuditPage) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
