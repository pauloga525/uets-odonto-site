# Sistema de Gestión de Citas Médicas y Odontológicas — UETS

Aplicación web para reservar, atender y administrar citas de 1 hora, con login de Google restringido por dominio,
disponibilidad en tiempo real y **garantía en base de datos de que un horario nunca se reserva dos veces**.

| Capa | Tecnología |
|---|---|
| Frontend | Angular 20 (standalone, signals, zoneless) · Angular Material 3 · FullCalendar |
| Backend | NestJS 11 (TypeScript) · Prisma 6 · Socket.IO |
| Base de datos | PostgreSQL 16 |
| Autenticación | Google OpenID Connect (Authorization Code + PKCE) → sesión propia en cookies httpOnly |
| Compartido | `@odonto/shared`: enums, máquina de estados, esquemas Zod, DTOs y utilidades de fecha |

## Documentación

- **[Manual de uso](docs/MANUAL-DE-USO.md)**: funcionamiento, uso por rol (paciente, doctor, administrador), ejecución y
  actualización del servidor.
- **[Despliegue en Ubuntu](docs/DESPLIEGUE-UBUNTU.md)**: instalación en producción con Cloudflare Tunnel.

## Estructura

```
apps/api          API NestJS (módulos: auth, users, settings, audit, slots, availability, appointments, realtime)
apps/api/prisma   Esquema, migraciones (incluye índices parciales y CHECKs) y seed con los 4 períodos
apps/web          SPA Angular (features: auth, patient, doctor, admin · shared: slot-picker, calendario, etc.)
packages/shared   Código compartido entre front y back
```

## Puesta en marcha (desarrollo)

Requisitos: Node 20.19+ (probado con 24), Docker Desktop.

```bash
cp .env.example .env          # completar secretos (ver comentarios del archivo)
npm install                   # instala todo y compila @odonto/shared
npm run db:up                 # PostgreSQL en localhost:5433
npm run db:migrate            # aplica migraciones
npm run db:seed               # configuración, admin, doctor y los 4 períodos de oct/nov 2026
npm run dev:api               # http://localhost:3000/api/v1  (Swagger: /api/docs)
npm run dev:web               # http://localhost:4200  (proxy /api → 3000)
```

Sin credenciales de Google, con `AUTH_DEV_LOGIN=true` la pantalla de login muestra **"Acceso de desarrollo"**:
permite entrar con cualquier correo aplicando las mismas reglas de dominio y roles.
Nunca se habilita cuando `NODE_ENV=production`.

- `admin@uets.edu.ec` → ADMIN (según `BOOTSTRAP_ADMIN_EMAIL`)
- `doctor@uets.edu.ec` → DOCTOR (según `BOOTSTRAP_DOCTOR_EMAIL`)
- cualquier otro `@uets.edu.ec` → PATIENT
- `@gmail.com` → rechazado

### Configurar Google OAuth

No se necesita LDAP: Google Workspace es el directorio y la app autentica con OpenID Connect.

1. En https://console.cloud.google.com (con la cuenta de administrador de `uets.edu.ec`) crear un proyecto,
   p. ej. `citas-uets`.
2. *APIs y servicios → Pantalla de consentimiento OAuth*: tipo de usuario **Interno** (solo cuentas `@uets.edu.ec`),
   nombre de la app, correo de soporte y los alcances `openid`, `email` y `profile`. No hace falta verificación de Google.
3. *APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth*, tipo **Aplicación web**:
   - Orígenes de JavaScript autorizados: `http://localhost:4200` y `https://citas.uets.edu.ec` (dominio real).
   - URI de redirección autorizados: `http://localhost:4200/api/v1/auth/google/callback` y
     `https://citas.uets.edu.ec/api/v1/auth/google/callback`.
4. Copiar el ID y el secreto en `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (y `GOOGLE_REDIRECT_URI` en producción).

**Cuentas estudiantiles.** "Interno" admite a *todos* los usuarios del dominio, incluidos los estudiantes, así que la
app bloquea por patrón: `BLOCKED_EMAIL_PATTERNS=*.est@uets.edu.ec` (valor por defecto, editable en
*Configuración → Cuentas bloqueadas*, con un probador de correos). La regla se revisa al iniciar sesión y en cada
renovación de la sesión.
Como segunda barrera, si los estudiantes están en su propia unidad organizativa se les puede bloquear la app desde la
Consola de administración (*Seguridad → Control de acceso y datos → Controles de API → Acceso de apps de terceros*;
configurar la app por su ID de cliente con acceso **Bloqueado** para esa UO).

## Reglas de negocio clave

- **Configuración → generación → disponibilidad → reserva → cita.** Los horarios no se guardan: se calculan de
  período × días habilitados × bloques horarios − días no disponibles, menos las citas activas.
- **Doble reserva imposible:** índice único parcial
  `uq_appt_slot_active (doctor_id, appointment_date, start_time) WHERE status <> 'CANCELADA'`.
  El backend revalida la disponibilidad, inserta dentro de una transacción y traduce la violación de unicidad a
  `409 SLOT_TAKEN` con el mensaje del requerimiento. Cancelar libera el horario.
- **Ciclo de vida:** `RESERVADA → INICIADA → EN_PROCESO → FINALIZADA` y `RESERVADA → CANCELADA`, con bloqueo
  optimista (`version`) para que dos pestañas no se pisen.
- **Seguimiento:** se crea en la misma transacción que la finalización (si el horario se ocupa, no se finaliza nada) y
  queda enlazado con `previous_appointment_id`.
- **Cambios de disponibilidad seguros:** editar/eliminar un período o agregar un día no disponible se revierte si deja
  citas futuras fuera de la configuración (`409 AVAILABILITY_IN_USE` con la lista de citas afectadas).
- **Cancelaciones:** solo el doctor o el administrador pueden cancelar (y solo citas RESERVADAS); el paciente
  recibe `403` y en su pantalla se le indica comunicarse con el consultorio.
- Políticas configurables: dominios permitidos, antelación mínima para reservar
  (60 min) y máximo de citas activas por paciente (1).

## Seguridad y protección de datos

- Cookies `HttpOnly` + `SameSite=Lax` (+ `Secure` en producción); access token de 15 min y refresh token rotativo
  con detección de reutilización.
- CSRF *double-submit cookie* (Angular envía `X-XSRF-TOKEN` automáticamente).
- RBAC global (`@Roles`) + autorización por recurso (un paciente solo accede a sus citas; recibe 404 en las ajenas).
- Validación con Zod en ambos extremos, consultas parametrizadas (Prisma), Helmet/CSP, rate limiting.
- Observaciones clínicas cifradas con AES-256-GCM (`DATA_ENCRYPTION_KEY`); los pacientes no las reciben.
- Auditoría de login, reservas, transiciones de estado, cambios de disponibilidad, usuarios y configuración.
- Consentimiento LOPDP registrado en el primer ingreso (`users.consent_at`).
- Backups diarios con `pg_dump` (servicio `backup` del compose, retención de 14 días).

## Pruebas

```bash
npm test            # unitarias: generador de horarios con los 4 períodos reales y máquina de estados
npm run test:e2e    # integración contra PostgreSQL (base odonto_test)
```

La suite de integración incluye la prueba de carrera: **50 pacientes confirman el mismo horario a la vez →
exactamente 1 `201` y 49 `409 SLOT_TAKEN`**. También cubre: rechazo de dominio, CSRF, horarios fuera de la
configuración (30/10 20:00), límite de citas activas, paciente sin permiso para cancelar, cancelación por el doctor y nueva reserva, acceso entre pacientes,
flujo del doctor con seguimiento, reversión de la transacción, cifrado de observaciones, auditoría y protección de
períodos con citas.

Antes de la primera ejecución: `docker compose exec db psql -U odonto -c "CREATE DATABASE odonto_test;"`.

## Despliegue

Guía completa: **[docs/DESPLIEGUE-UBUNTU.md](docs/DESPLIEGUE-UBUNTU.md)**. En un Ubuntu Server con IP pública:

```bash
sudo bash deploy/instalar-ubuntu.sh
```

Instala Docker, crea el `.env` con secretos aleatorios y publica la app con **Cloudflare Tunnel**
(`https://<palabras>.trycloudflare.com`, HTTPS de Cloudflare, sin abrir puertos). `deploy/tunel-url.sh` muestra la
dirección actual, que cambia si el túnel se reinicia. Detrás: **Nginx** → **API** → **PostgreSQL**. Incluye respaldos diarios.

## Segunda etapa (pendiente)

Correos de confirmación, cancelación y recordatorio 24 h antes (cola BullMQ + Redis); reportes y estadísticas; exportación CSV/PDF; auditoría avanzada; varios doctores (el modelo ya lo admite).
