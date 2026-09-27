# Despliegue en Ubuntu Server con dominio gratuito (sslip.io)

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
