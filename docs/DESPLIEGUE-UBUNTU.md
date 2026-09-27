# Despliegue en Ubuntu Server

El instalador ofrece dos modos:

| Modo | Dirección | Puertos | Nota |
|---|---|---|---|
| **1. Cloudflare Tunnel rápido** (por defecto) | `https://<palabras>.trycloudflare.com` | **No abre ninguno** | La dirección cambia si el túnel se reinicia |
| 2. Caddy + sslip.io | `https://citas.<IP-pública>.sslip.io` | 80 y 443 redirigidos al servidor | Dirección fija |

## Modo 1 — Cloudflare Tunnel rápido

```
Usuario ──HTTPS──▶ Cloudflare ══túnel══▶ cloudflared (servidor) ──▶ Nginx ──▶ API ──▶ PostgreSQL
```

1. `sudo bash deploy/instalar-ubuntu.sh` → opción **1**. Al final muestra la dirección, p. ej.
   `https://tres-palabras-azar.trycloudflare.com`.
2. En Google Cloud → Clientes → su ID de cliente, agregue esa dirección como **origen** y
   `<dirección>/api/v1/auth/google/callback` como **URI de redireccionamiento**.
3. Ponga `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env` y aplique: `sudo docker compose up -d`.

**Cuando la dirección cambie** (reinicio del servidor, de Docker o del contenedor `tunnel`):

```bash
sudo bash deploy/tunel-url.sh      # muestra la dirección nueva y las URIs para Google
```

La aplicación se adapta sola (deduce su dirección de cada visita); solo hay que reemplazar las dos direcciones
en Google. Para no cambiarla sin necesidad, evite `docker compose down` y reinicie solo lo necesario, p. ej.
`sudo docker compose restart api`. Limitaciones del túnel rápido según Cloudflare: sin garantía de disponibilidad y
pensado para pruebas; para uso definitivo conviene un túnel con dominio propio o el modo 2.

---

## Modo 2 — Caddy + sslip.io


Sin comprar dominio: **sslip.io** convierte la IP del servidor en un nombre válido.
Si la IP pública es `200.1.2.3`, la app queda en **`https://citas.200-1-2-3.sslip.io`**, con certificado HTTPS
gratuito de Let's Encrypt que Caddy obtiene y renueva automáticamente.

```
Internet ──443──▶ Caddy (HTTPS) ──▶ Nginx (app Angular + /api) ──▶ API NestJS ──▶ PostgreSQL
```

## Requisitos

- Ubuntu Server 22.04 o 24.04, 2 GB de RAM mínimo (4 GB recomendado para compilar), 10 GB de disco.
- **IP pública** con los puertos **80 y 443 accesibles desde internet**. Si el servidor está detrás del router o
  firewall del colegio, hay que redirigir esos dos puertos a la IP interna del servidor. Sin esto Let's Encrypt no
  puede emitir el certificado.

## 1. Copiar el proyecto al servidor

Desde el equipo de desarrollo (o con `git clone` si el proyecto está en un repositorio):

```bash
scp -r sistemaOdonto usuario@200.1.2.3:~/
```

(No copie `node_modules`, `dist` ni el `.env` de desarrollo.)

## 2. Ejecutar el instalador

```bash
ssh usuario@200.1.2.3
cd ~/sistemaOdonto
sudo bash deploy/instalar-ubuntu.sh
```

El script pregunta el correo del administrador y del doctor, genera las contraseñas y secretos, construye todo y al
final muestra el dominio y las dos direcciones que hay que registrar en Google.

## 3. Registrar el dominio en Google

Google Cloud → *APIs y servicios* → *Credenciales* → su ID de cliente OAuth → agregar:

| Campo | Valor |
|---|---|
| Orígenes autorizados de JavaScript | `https://citas.200-1-2-3.sslip.io` |
| URI de redireccionamiento autorizados | `https://citas.200-1-2-3.sslip.io/api/v1/auth/google/callback` |

Si aún no puso `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `~/sistemaOdonto/.env`, hágalo ahora y aplique:

```bash
sudo docker compose --profile prod up -d
```

## Operación diaria

```bash
cd ~/sistemaOdonto
sudo docker compose ps                         # estado de los servicios
sudo docker compose logs -f caddy api          # registros (certificado, errores)
sudo docker compose --profile prod up -d --build   # actualizar tras copiar una versión nueva
ls backups/                                    # respaldos diarios de la base (14 días)
```

Restaurar un respaldo:

```bash
sudo docker compose exec -T db pg_restore -U odonto -d odonto --clean < backups/odonto_AAAAMMDD_HHMM.dump
```

## Problemas frecuentes

- **El certificado no se emite** (`caddy` muestra errores de "challenge"): los puertos 80/443 no llegan al servidor.
  Revise la redirección de puertos del router/firewall y `sudo ufw status`.
- **Google responde "redirect_uri_mismatch"**: la URI registrada en Google debe coincidir exactamente con
  `GOOGLE_REDIRECT_URI` del `.env` (https, sin barra final).
- **Si Google no acepta el dominio sslip.io**: use un subdominio de `uets.edu.ec` (registro DNS tipo A
  `citas` → IP del servidor) y ejecute de nuevo el instalador. Luego cambie `APP_DOMAIN`, `WEB_URL` y
  `GOOGLE_REDIRECT_URI` en `.env` por `citas.uets.edu.ec`.
- **Cambió la IP del servidor**: vuelva a ejecutar `sudo bash deploy/instalar-ubuntu.sh`; conserva datos y secretos
  y solo actualiza el dominio (después actualice las direcciones en Google).
- **Nunca cambie `DATA_ENCRYPTION_KEY`** una vez en uso: sin ella no se pueden leer las observaciones clínicas guardadas.
  Guarde una copia del `.env` en un lugar seguro.
