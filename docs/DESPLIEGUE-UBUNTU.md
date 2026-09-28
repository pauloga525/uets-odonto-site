# Despliegue en Ubuntu Server con Cloudflare Tunnel

La app se publica con un **túnel rápido de Cloudflare**: `https://<palabras>.trycloudflare.com`, con HTTPS de
Cloudflare y **sin abrir puertos** en el servidor ni en el router del colegio.

```
Usuario ──HTTPS──▶ Cloudflare ══túnel══▶ cloudflared (servidor) ──▶ Nginx ──▶ API ──▶ PostgreSQL
```

> **La dirección cambia cada vez que el contenedor del túnel se reinicia** (reinicio del servidor, de Docker, etc.).
> La aplicación se adapta sola; lo único manual es actualizar las dos direcciones en Google Cloud.

## Requisitos

- Ubuntu Server 22.04 o 24.04, 2 GB de RAM mínimo (4 GB recomendado para compilar), 10 GB de disco.
- Salida a internet desde el servidor (no hace falta IP pública ni abrir puertos).
- ID y secreto del cliente OAuth de Google (tipo "Aplicación web", pantalla de consentimiento **Interna**).

## 1. Obtener el proyecto en el servidor

```bash
git clone https://github.com/pauloga525/uets-odonto-site.git
cd uets-odonto-site
```

(Para actualizar una instalación existente: `cd uets-odonto-site && git pull`.)

## 2. Ejecutar el instalador

```bash
sudo bash deploy/instalar-ubuntu.sh
```

La primera vez pregunta el correo del administrador y del doctor, genera contraseñas y secretos, construye todo,
carga los datos iniciales y al final muestra la dirección del túnel y las URIs para Google.

## 3. Registrar la dirección en Google

Google Cloud → *Google Auth Platform* → *Clientes* → su cliente → agregue (y guarde):

| Campo | Valor |
|---|---|
| Orígenes autorizados de JavaScript | `https://<palabras>.trycloudflare.com` |
| URI de redireccionamiento autorizados | `https://<palabras>.trycloudflare.com/api/v1/auth/google/callback` |

**Correos a pacientes:** el instalador pide la **contraseña de aplicación** de `noreply@uets.edu.ec`
(se crea en https://myaccount.google.com/apppasswords con esa cuenta, que debe tener la verificación en dos pasos
activa). Si la omitió, complete `SMTP_PASS` en `.env`. Después, en **Configuración → Correos a pacientes** use
**Enviar correo de prueba** para confirmar que funciona.

Si aún no puso `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`, hágalo (`sudo nano .env`) y aplique:

```bash
sudo docker compose up -d
```

## Cuando la dirección cambie

```bash
sudo bash deploy/tunel-url.sh
```

Muestra la dirección nueva y las dos URIs: reemplace las anteriores en Google (tarda unos minutos en aplicar).
Para no provocar cambios innecesarios, evite `docker compose down` y reinicie solo lo que haga falta, por ejemplo
`sudo docker compose restart api`.

## Operación diaria

```bash
sudo docker compose ps                        # estado de los servicios
sudo docker compose logs --tail=100 api tunnel
sudo bash deploy/tunel-url.sh                 # dirección actual
ls backups/                                   # respaldos diarios de la base (14 días)
```

Actualizar a una versión nueva: `git pull` y `sudo bash deploy/instalar-ubuntu.sh` (conserva `.env` y datos).

Restaurar un respaldo:

```bash
sudo docker compose exec -T db pg_restore -U odonto -d odonto --clean < backups/odonto_AAAAMMDD_HHMM.dump
```

## Problemas frecuentes

- **`tunel-url.sh` no encuentra la dirección:** `sudo docker compose logs tunnel`; el servidor necesita salida a
  internet (el túnel usa el puerto 7844 saliente de Cloudflare).
- **Google responde `redirect_uri_mismatch`:** la dirección del túnel cambió o no coincide exactamente; ejecute
  `tunel-url.sh` y copie las URIs tal cual (https, sin barra final).
- **Botón de Google en gris:** faltan `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en `.env` o no se ejecutó
  `sudo docker compose up -d` después de ponerlos.
- **Nunca cambie `DATA_ENCRYPTION_KEY`** una vez en uso: sin ella no se pueden leer las observaciones clínicas.
  Guarde una copia del `.env` en un lugar seguro.

> El túnel rápido es un servicio gratuito de Cloudflare sin garantía de disponibilidad. Para un uso definitivo con
> dirección fija, lo recomendable es un túnel con dominio propio en Cloudflare.
