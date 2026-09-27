# Manual de uso — Sistema de Citas Médicas y Odontológicas UETS

**Contenido**

1. [¿Qué es el sistema?](#1-qué-es-el-sistema)
2. [Cómo funciona](#2-cómo-funciona)
3. [Ingreso al sistema](#3-ingreso-al-sistema)
4. [Manual del paciente](#4-manual-del-paciente)
5. [Manual del doctor](#5-manual-del-doctor)
6. [Manual del administrador](#6-manual-del-administrador)
7. [Ejecución del sistema (parte técnica)](#7-ejecución-del-sistema-parte-técnica)
8. [Pasos para actualizar el servidor](#8-pasos-para-actualizar-el-servidor)
9. [Preguntas frecuentes y solución de problemas](#9-preguntas-frecuentes-y-solución-de-problemas)
10. [Seguridad y protección de datos](#10-seguridad-y-protección-de-datos)

---

## 1. ¿Qué es el sistema?

Aplicación web para **reservar, atender y administrar citas médicas y odontológicas** del consultorio de la UETS.
Funciona en computadora y celular, desde el navegador, sin instalar nada.

Hay tres tipos de usuario (roles):

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| **Paciente** | Cualquier persona del personal con correo `@uets.edu.ec` | Ver horarios libres, reservar una cita y consultar sus citas |
| **Doctor** | El profesional del consultorio | Ver su agenda, atender las citas (iniciar, en proceso, finalizar), registrar observaciones, agendar seguimientos, reprogramar y cancelar |
| **Administrador** | Responsable del sistema | Todo lo del doctor, más configurar la disponibilidad, gestionar usuarios, parámetros generales y revisar la auditoría |

> Las **cuentas estudiantiles** (`nombre.apellido.est@uets.edu.ec`) y los correos de otros dominios (`@gmail.com`, etc.)
> **no pueden ingresar**.

---

## 2. Cómo funciona

### 2.1 De la configuración a la cita

```
Administrador configura períodos  →  el sistema genera horarios de 1 hora  →  el paciente ve los libres
            →  reserva  →  se crea la cita  →  el doctor la atiende
```

- **Período de atención:** rango de fechas (p. ej. 12 al 16 de octubre), días habilitados (lunes a viernes) y uno o
  más **bloques horarios** (p. ej. 08:00–12:00 y 13:00–17:00).
- **Horarios:** el sistema los genera solo, **siempre de 1 hora** y en punto (08:00, 09:00, …). Un bloque
  08:00–12:00 produce 4 horarios: 08:00, 09:00, 10:00 y 11:00.
- **Días no disponibles:** feriados o días sin atención dentro de un período; esos días no ofrecen horarios.

Períodos cargados inicialmente:

| Período | Fechas | Horarios |
|---|---|---|
| Primero | 12 – 16 oct 2026 | 08:00–12:00 y 13:00–17:00 |
| Segundo | 19 – 23 oct 2026 | 08:00–12:00 y 13:00–17:00 |
| Tercero | 26 – 30 oct 2026 | 11:00–15:00 y 16:00–20:00 |
| Cuarto | 9 – 13 nov 2026 | 11:00–15:00 y 16:00–20:00 |

### 2.2 Regla central: un horario, una sola cita

Un horario de una hora **solo puede reservarse una vez**. Si dos personas intentan reservar el mismo horario al mismo
tiempo, **solo una lo obtiene**; la otra ve el mensaje:

> *El horario seleccionado acaba de ser reservado por otro usuario. Por favor, selecciona otro horario.*

La garantía está en la base de datos, no depende de la pantalla.

### 2.3 Disponibilidad en tiempo real

Si alguien reserva mientras otra persona está mirando el mismo día, **el horario se marca "Ocupado" al instante**, sin
recargar la página. Si justo era el horario que el paciente tenía seleccionado, el sistema se lo avisa antes de que
confirme.

### 2.4 Estados de una cita

```
RESERVADA ──▶ INICIADA ──▶ EN PROCESO ──▶ FINALIZADA
    │
    └──▶ CANCELADA
```

| Estado | Significado | Color |
|---|---|---|
| **Reservada** | El paciente reservó correctamente | Azul |
| **Iniciada** | El doctor comenzó la atención | Ámbar |
| **En proceso** | La consulta está en curso | Violeta |
| **Finalizada** | El doctor terminó y registró observaciones | Verde |
| **Cancelada** | La cita fue cancelada (el horario queda libre de nuevo) | Gris |

No se pueden saltar pasos (no se puede finalizar una cita que no está en proceso) y solo se cancelan citas
**Reservadas**.

### 2.5 Reglas y políticas

| Regla | Valor actual | ¿Configurable? |
|---|---|---|
| Duración de cada cita | 1 hora | No |
| Citas activas por paciente | 1 a la vez | Sí (Configuración) |
| Antelación mínima para reservar | 60 minutos | Sí (Configuración) |
| Quién puede cancelar | **Solo el doctor o el administrador** | No |
| Dominio permitido | `uets.edu.ec` | Sí (Configuración) |
| Cuentas bloqueadas | `*.est@uets.edu.ec` (estudiantes) | Sí (Configuración) |

### 2.6 Citas de seguimiento

Al finalizar una atención, el doctor puede agendar una **nueva cita para el mismo paciente**. Queda enlazada con la
anterior y así se arma el **historial de atención** (Cita #1 → Seguimiento #4 → …). El seguimiento solo puede
agendarse en horarios configurados y libres.

---

## 3. Ingreso al sistema

1. Abra la dirección del sistema en el navegador (la entrega el administrador; tiene la forma
   `https://…trycloudflare.com`).
2. Pulse **Iniciar sesión con Google** y elija su cuenta **`@uets.edu.ec`**.
3. **Primera vez:** aparece el aviso de **protección de datos personales** (Ley Orgánica de Protección de Datos
   Personales). Márquelo y pulse **Aceptar y continuar**.
4. El sistema lo lleva a la pantalla de su rol.

Mensajes posibles al ingresar:

| Mensaje | Qué significa |
|---|---|
| *Tu cuenta de correo no pertenece a un dominio autorizado* | El correo no es `@uets.edu.ec` |
| *Las cuentas estudiantiles no están habilitadas* | Es una cuenta `.est@uets.edu.ec` |
| *Tu cuenta está desactivada* | El administrador desactivó la cuenta |
| *Tu sesión expiró* | Vuelva a iniciar sesión |

**Otras opciones de la barra superior:**
- Icono de sol/luna: tema **claro, oscuro o automático**.
- Su foto o iniciales: ver sus datos y **Cerrar sesión**.

En el celular, el menú principal está en la **barra inferior**; en computadora, en la **barra lateral izquierda**.

---

## 4. Manual del paciente

### 4.1 Inicio
Muestra su **próxima cita** (fecha, hora, cuenta regresiva) con el botón **Agregar a mi calendario**, y accesos a
**Reservar cita** y **Mis citas**.

### 4.2 Reservar una cita (3 pasos)

1. Menú **Reservar**.
2. **Elija una fecha:** el calendario abre directamente en el primer mes con cupo y **ya selecciona el primer día
   disponible**.
   - Días resaltados con un número = días con horarios libres (el número indica cuántos).
   - Días atenuados = sin atención. Días tachados ("lleno") = sin cupo.
3. **Elija un horario:** aparecen agrupados en **Mañana / Tarde / Noche**. Los ocupados se ven tachados y no se
   pueden elegir.
4. En la barra inferior pulse **Continuar**, revise el resumen (fecha, horario, lugar) y pulse
   **Confirmar reserva**.
5. Verá **¡Cita reservada correctamente!** con opciones para agregarla a **Google Calendar** o descargar el archivo
   **.ics** (Outlook, calendario del celular).

Si otra persona reservó ese horario un instante antes, el sistema lo avisa, **mantiene la fecha elegida** y resalta
los horarios libres más cercanos para que elija otro.

Si ya tiene una cita activa, el sistema no permite reservar otra hasta que esa finalice.

### 4.3 Mis citas
Pestañas **Próximas**, **Historial** y **Canceladas**, con el estado de cada cita. Las citas de seguimiento indican
de qué cita provienen.

### 4.4 ¿No puede asistir?
El paciente **no puede cancelar desde el sistema**. **Comuníquese con el consultorio**: el doctor o el administrador
cancelará o reprogramará la cita y el horario quedará libre para otra persona.

> Las observaciones clínicas que registra el doctor **no se muestran** al paciente en el sistema.

---

## 5. Manual del doctor

Menú: **Hoy · Agenda · Citas · Disponibilidad**.

### 5.1 Hoy (pantalla principal)
- Indicadores del día: citas, por atender, en atención y finalizadas.
- **Línea de tiempo** con todos los horarios del día; el bloque actual se resalta como **Ahora**.
- Flechas **‹ ›** y botón **Hoy** para moverse entre días. Si el día no tiene atención, aparece el botón
  **Ir a la próxima cita**.
- Cada cita tiene **un solo botón principal** que cambia según el estado:

| Estado actual | Botón | Pasa a |
|---|---|---|
| Reservada | **Iniciar atención** | Iniciada |
| Iniciada | **Pasar a en proceso** | En proceso |
| En proceso | **Finalizar atención** | Finalizada |

La pantalla se actualiza sola cuando se reserva o cancela una cita.

### 5.2 Finalizar una atención
Al pulsar **Finalizar atención** se abre una ventana con paciente, fecha y horario:

1. Escriba las **Observaciones** (diagnóstico, procedimiento, indicaciones; hasta 5000 caracteres). Se guardan
   **cifradas**. Si cierra la ventana por error, el borrador se conserva mientras el navegador siga abierto.
2. Si requiere control, active **¿Requiere nueva cita?**: aparece el mismo calendario del paciente con **solo
   horarios válidos y libres**; elija fecha y hora.
3. Pulse **Finalizar atención** (o **Finalizar y agendar seguimiento**).

Si el horario de seguimiento se ocupa en ese instante, **no se finaliza nada**: el sistema lo avisa para que elija
otro horario, sin perder lo escrito.

### 5.3 Detalle de la cita
Al hacer clic en el nombre del paciente o en el icono de abrir:
- **Siguiente paso** (acción principal según el estado).
- **Seguimiento de estados** con fecha y hora de cada cambio.
- **Observaciones** registradas.
- **Citas relacionadas** (cita anterior y seguimientos).
- Datos del paciente, **últimas atenciones** y acceso a su **historial completo**.
- **Otras acciones:** *Crear cita de seguimiento* (si está en proceso o finalizada), *Reprogramar* y
  *Cancelar cita* (si está reservada; la cancelación pide un motivo).

### 5.4 Agenda
Calendario con vistas **Día, Semana, Mes y Lista**. Los horarios libres se ven sombreados y las citas con el color de
su estado. Botón **Próxima cita** para saltar a la siguiente. Clic en una cita → detalle. En el celular abre en vista
de lista.

### 5.5 Historial del paciente
Línea de tiempo con todas las citas del paciente, sus estados, observaciones y el encadenamiento de seguimientos.

### 5.6 Citas y Disponibilidad
Mismas pantallas que el administrador (secciones 6.3 y 6.2), limitadas a su propia agenda.

---

## 6. Manual del administrador

Menú: **Panel · Agenda · Citas · Disponibilidad · Usuarios · Configuración · Auditoría**.

### 6.1 Panel
Indicadores: citas de hoy, pendientes, finalizadas y **ocupación** del período actual, más las próximas citas.

### 6.2 Disponibilidad

**Crear o editar un período** (botón **Nuevo período** o **Editar** en una tarjeta):
1. **Nombre** (p. ej. "Quinto período").
2. **Fecha inicial** y **Fecha final**.
3. **Días habilitados**: botones L M X J V S D.
4. **Bloques horarios**: *Desde* – *Hasta*. Use **Agregar bloque** para más de uno (p. ej. mañana y tarde). Los
   bloques no pueden superponerse.
5. **Período activo**: si se desactiva, sus horarios dejan de ofrecerse.
6. A la derecha, la **Vista previa** muestra en vivo cuántos horarios se generarán y cuáles.
7. **Guardar disponibilidad**.

Cada tarjeta muestra fechas, días, bloques y **ocupación** (citas / horarios).

**Protección:** el sistema **no permite** editar, eliminar un período ni agregar un día no disponible si eso deja
citas reservadas fuera de la disponibilidad; muestra la lista de citas afectadas. Primero reprograme o cancele esas
citas.

**Días no disponibles:** elija la **Fecha**, escriba el **Motivo** (p. ej. "Feriado") y pulse **Agregar**. Para
quitarlo, use la **X**.

### 6.3 Citas
- **Filtros:** buscar paciente (nombre o correo), *Mostrar* (Próximas, Historial, Canceladas, Todas), *Estado* y
  rango *Desde/Hasta*. **Limpiar** restablece los filtros.
- Clic en una fila → detalle. Menú **⋮** → ver detalle, historial del paciente, **Reprogramar** o **Cancelar**
  (solo citas reservadas).
- **Nueva cita:** busque al paciente (debe haber ingresado al sistema al menos una vez), elija fecha y horario y
  pulse **Reservar cita**.

### 6.4 Usuarios
- Los pacientes **se registran solos** la primera vez que ingresan con Google.
- **Rol:** cambie entre Paciente, Doctor y Administrador (pide confirmación).
- **Activo:** desactivar una cuenta **cierra sus sesiones** y le impide ingresar.
- No puede cambiar su propio rol ni desactivarse a sí mismo.
- **Historial** (pacientes): acceso a todas sus citas.

> **Importante sobre el rol Doctor:** el sistema trabaja con **un solo doctor**, dueño de los períodos y la agenda. Si
> asigna el rol Doctor a otra cuenta desde esta pantalla, se crea un segundo doctor **sin períodos** y los pacientes
> seguirán reservando con el primero. Para cambiar la cuenta del doctor, solicite el cambio al área técnica.

### 6.5 Configuración
- **Consultorio:** nombre y ubicación.
- **Dominios autorizados:** solo esos correos pueden ingresar (Enter para agregar).
- **Cuentas bloqueadas:** patrones de correo que no pueden ingresar aunque el dominio esté autorizado. `*` significa
  "cualquier texto". Ejemplo: `*.est@uets.edu.ec` bloquea las cuentas estudiantiles.
  - **Probar un correo:** escriba un correo y el sistema indica si puede ingresar o por qué no.
- **Políticas de reserva:** antelación mínima (minutos) y máximo de citas activas por paciente.
- **Guardar cambios.**

### 6.6 Auditoría
Registro de acciones importantes: ingresos (y rechazados), reservas, cambios de estado (estado anterior → nuevo),
cancelaciones, reprogramaciones, cambios de disponibilidad, de usuarios y de configuración, con **usuario, fecha y
hora e IP**.

---

## 7. Ejecución del sistema (parte técnica)

### 7.1 Componentes

```
Navegador ──HTTPS──▶ Cloudflare ══túnel══▶ cloudflared ──▶ Nginx (app Angular + /api) ──▶ API NestJS ──▶ PostgreSQL
```

| Componente | Tecnología | Función |
|---|---|---|
| Frontend | Angular 20 + Angular Material | Pantallas |
| API | NestJS + Prisma | Reglas de negocio, seguridad, tiempo real |
| Base de datos | PostgreSQL 16 | Datos y garantía de no doble reserva |
| Nginx | — | Sirve la app y reenvía `/api` a la API |
| Cloudflare Tunnel | cloudflared | Publica la app con HTTPS sin abrir puertos |
| Respaldos | pg_dump | Copia diaria de la base (se guardan 14 días) |

### 7.2 Ejecución en una computadora de desarrollo

Requisitos: Node.js 20.19 o superior, Docker Desktop, Git.

```bash
git clone https://github.com/pauloga525/uets-odonto-site.git
cd uets-odonto-site
cp .env.example .env          # completar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, secretos y correos
npm install                   # instala todo (una sola vez desde la raíz)
npm run db:up                 # PostgreSQL en Docker
npm run db:migrate            # crea las tablas
npm run db:seed               # configuración, administrador, doctor y períodos
```

Luego, en **dos terminales**:

```bash
npm run dev:api               # API en http://localhost:3000
```
```bash
npm run dev:web               # App en http://localhost:4200
```

Abra **http://localhost:4200**. En Google Cloud deben estar registrados `http://localhost:4200` (origen) y
`http://localhost:4200/api/v1/auth/google/callback` (redirección).

Pruebas automáticas:

```bash
npm test              # unitarias
npm run test:e2e      # integración (requiere la base odonto_test, ver README)
```

### 7.3 Instalación en el servidor (producción)

Requisitos: Ubuntu Server 22.04/24.04, 2 GB de RAM (4 GB recomendado), 10 GB de disco, salida a internet. **No hace
falta abrir puertos ni tener IP pública.**

```bash
git clone https://github.com/pauloga525/uets-odonto-site.git
cd uets-odonto-site
sudo bash deploy/instalar-ubuntu.sh
```

El instalador:
1. Instala Docker si hace falta.
2. Crea el `.env` de producción (pregunta el correo del **administrador** y del **doctor**; genera contraseñas y
   secretos).
3. Construye y levanta: base de datos, API, Nginx, túnel de Cloudflare y respaldos.
4. Carga los datos iniciales.
5. Muestra la **dirección pública** (`https://…trycloudflare.com`) y las **dos URIs para Google**.

Después:
1. En **Google Cloud → Google Auth Platform → Clientes → su cliente**, agregue la dirección como **Origen autorizado
   de JavaScript** y `<dirección>/api/v1/auth/google/callback` como **URI de redireccionamiento**. Guarde.
2. Ponga `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en el `.env` (`sudo nano .env`) y aplique:
   ```bash
   sudo docker compose up -d
   ```

### 7.4 Operación diaria en el servidor

Todos los comandos se ejecutan dentro de la carpeta `uets-odonto-site`.

| Tarea | Comando |
|---|---|
| Ver el estado de los servicios | `sudo docker compose ps` |
| Ver la dirección actual del sistema | `sudo bash deploy/tunel-url.sh` |
| Ver registros (errores) | `sudo docker compose logs --tail=100 api tunnel` |
| Reiniciar solo la API | `sudo docker compose restart api` |
| Aplicar cambios del `.env` | `sudo docker compose up -d` |
| Ver respaldos | `ls backups/` |
| Respaldo manual inmediato | `sudo docker compose exec -T db pg_dump -U odonto -Fc odonto > backups/manual_$(date +%Y%m%d_%H%M).dump` |
| Restaurar un respaldo | `sudo docker compose exec -T db pg_restore -U odonto -d odonto --clean < backups/ARCHIVO.dump` |

> **La dirección del túnel cambia** cada vez que se reinicia el contenedor `tunnel` (reinicio del servidor, de
> Docker, etc.). Cuando pase, ejecute `sudo bash deploy/tunel-url.sh` y **reemplace las dos direcciones en Google**.
> Evite `docker compose down` para no provocar cambios innecesarios.

---

## 8. Pasos para actualizar el servidor

Use este procedimiento cada vez que haya una versión nueva del sistema.

### Paso 1 — Subir los cambios desde la computadora de desarrollo
En la carpeta del proyecto:

```bash
git add -A
git commit -m "Descripción del cambio"
git push
```

### Paso 2 — Conectarse al servidor
```bash
ssh USUARIO@IP-DEL-SERVIDOR
cd ~/uets-odonto-site
```

### Paso 3 — Hacer un respaldo antes de actualizar (recomendado)
```bash
sudo docker compose exec -T db pg_dump -U odonto -Fc odonto > backups/antes_actualizar_$(date +%Y%m%d_%H%M).dump
```

### Paso 4 — Descargar la versión nueva
```bash
git pull
```

### Paso 5 — Reconstruir y aplicar
```bash
sudo bash deploy/instalar-ubuntu.sh
```
Conserva el `.env` y todos los datos; reconstruye lo que cambió, aplica las migraciones de base de datos
automáticamente y vuelve a cargar los datos iniciales sin duplicarlos.

### Paso 6 — Verificar
```bash
sudo docker compose ps               # todos los servicios "Up" (la API "healthy")
sudo bash deploy/tunel-url.sh        # dirección actual
```
1. Si la dirección **cambió**, actualícela en Google Cloud (origen y URI de redireccionamiento).
2. Abra el sistema, inicie sesión y revise que todo funcione.

### Si algo sale mal
Revise los registros:
```bash
sudo docker compose logs --tail=100 api
```
Para volver a la versión anterior del código:
```bash
git log --oneline -5                 # identifique el commit anterior
git checkout <commit-anterior>
sudo bash deploy/instalar-ubuntu.sh
```
Y, si fuera necesario, restaure el respaldo del Paso 3 (ver sección 7.4). Para volver a la versión más reciente:
`git checkout main && git pull`.

---

## 9. Preguntas frecuentes y solución de problemas

| Situación | Solución |
|---|---|
| Google muestra **`redirect_uri_mismatch`** | La dirección del túnel cambió o no coincide. Ejecute `sudo bash deploy/tunel-url.sh` y copie las URIs exactas en Google. |
| El botón **Iniciar sesión con Google** aparece gris | Faltan `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en el `.env`, o no se aplicó con `sudo docker compose up -d`. |
| Un paciente no ve horarios | No hay períodos activos con cupo, o los horarios del día ya pasaron o están dentro de la antelación mínima. |
| No se puede eliminar o editar un período | Tiene citas reservadas que quedarían fuera. Reprograme o cancele esas citas primero. |
| Un paciente dice que no puede reservar una segunda cita | Ya tiene una cita activa (límite de 1). Cambie el límite en Configuración si corresponde. |
| El administrador no encuentra a un paciente para "Nueva cita" | El paciente debe haber ingresado al sistema al menos una vez. |
| Un estudiante debe poder ingresar | Quite o ajuste el patrón en **Configuración → Cuentas bloqueadas**. |
| `tunel-url.sh` no muestra la dirección | Revise `sudo docker compose logs tunnel`; el servidor necesita salida a internet. |
| La página no carga | `sudo docker compose ps`: todos deben estar "Up". Si no, `sudo docker compose up -d` y revise los registros. |

---

## 10. Seguridad y protección de datos

- Ingreso **solo con cuentas institucionales de Google**; el sistema nunca ve ni guarda contraseñas.
- Acceso por **roles**: cada usuario solo ve y hace lo que le corresponde; un paciente solo ve sus propias citas.
- **Observaciones clínicas cifradas** en la base de datos; solo el personal de salud las consulta.
- **Auditoría** de todas las acciones importantes.
- **Respaldos diarios** automáticos de la base de datos.
- Consentimiento de tratamiento de datos registrado en el primer ingreso (LOPDP Ecuador).
- **Custodia del archivo `.env` del servidor:** contiene los secretos del sistema. En especial
  `DATA_ENCRYPTION_KEY`: **si se pierde, las observaciones clínicas ya guardadas no se pueden recuperar**. Guarde una
  copia en un lugar seguro y nunca lo suba a GitHub.
