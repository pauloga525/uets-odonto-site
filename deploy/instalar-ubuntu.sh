#!/usr/bin/env bash
# =============================================================================
#  Instalación del Sistema de Citas UETS en Ubuntu Server (22.04 / 24.04)
#
#  Uso (desde la carpeta del proyecto):
#     sudo bash deploy/instalar-ubuntu.sh
#
#  Modos de publicación (el script pregunta):
#    1) Cloudflare Tunnel rápido → https://<palabras>.trycloudflare.com
#       No abre puertos. La dirección cambia si el túnel se reinicia.
#    2) Caddy + sslip.io         → https://citas.<IP-pública>.sslip.io
#       Requiere redirigir los puertos 80 y 443 hacia el servidor.
#
#  Se puede ejecutar varias veces: conserva la base de datos y los secretos del .env.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

info() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Ejecute con sudo:  sudo bash deploy/instalar-ubuntu.sh"
  exit 1
fi

# ---------------------------------------------------------------- Docker
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  info "Instalando Docker y Docker Compose…"
  apt-get update -y
  apt-get install -y docker.io docker-compose-v2 curl openssl
  systemctl enable --now docker
else
  info "Docker ya está instalado: $(docker --version)"
fi

# ---------------------------------------------------------------- .env
set_env() { # set_env CLAVE VALOR  (crea o reemplaza la línea en .env)
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}
get_env() { grep "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- || true; }

if [[ ! -f .env ]]; then
  info "Creando .env de producción…"
  cp deploy/env.produccion.ejemplo .env
  read -rp "Correo del ADMINISTRADOR (@uets.edu.ec): " ADMIN_EMAIL
  read -rp "Correo del DOCTOR (@uets.edu.ec): " DOCTOR_EMAIL
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_env JWT_ACCESS_SECRET "$(openssl rand -base64 48 | tr -d '\n=+/')"
  set_env DATA_ENCRYPTION_KEY "$(openssl rand -base64 32 | tr -d '\n')"
  set_env BOOTSTRAP_ADMIN_EMAIL "${ADMIN_EMAIL,,}"
  set_env BOOTSTRAP_DOCTOR_EMAIL "${DOCTOR_EMAIL,,}"
  chmod 600 .env
else
  info "Se conserva el .env existente."
fi

# ---------------------------------------------------------------- Modo de publicación
cat <<'EOF'

¿Cómo se publicará la aplicación?
  1) Cloudflare Tunnel rápido (*.trycloudflare.com) — no abre puertos; la dirección cambia al reiniciar
  2) Caddy + sslip.io — dirección fija; requiere redirigir los puertos 80 y 443 hacia este servidor
EOF
read -rp "Opción [1/2] (Enter = 1): " MODE
MODE="${MODE:-1}"

case "$MODE" in
  1)
    set_env COMPOSE_PROFILES "prod,tunnel"
    # Vacíos = la app deduce su dirección de cada petición (se adapta cuando el túnel cambia)
    set_env WEB_URL ""
    set_env GOOGLE_REDIRECT_URI ""
    ;;
  2)
    IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
    read -rp "IP pública del servidor [${IP}]: " IP_IN
    IP="${IP_IN:-$IP}"
    if ! [[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then echo "IP inválida"; exit 1; fi
    DOMAIN="citas.${IP//./-}.sslip.io"
    set_env COMPOSE_PROFILES "prod,caddy"
    set_env APP_DOMAIN "$DOMAIN"
    set_env WEB_URL "https://${DOMAIN}"
    set_env GOOGLE_REDIRECT_URI "https://${DOMAIN}/api/v1/auth/google/callback"
    if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
      ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp
    fi
    ;;
  *) echo "Opción inválida"; exit 1 ;;
esac

# Detiene el servicio del otro modo (por si se cambió de modo)
docker compose --profile caddy --profile tunnel stop caddy tunnel >/dev/null 2>&1 || true

# ---------------------------------------------------------------- Levantar
info "Construyendo y levantando la aplicación (la primera vez tarda varios minutos)…"
docker compose up -d --build --remove-orphans

info "Esperando a que la API esté lista…"
for _ in $(seq 1 60); do
  if docker compose exec -T api wget -qO- http://localhost:3000/api/v1/health >/dev/null 2>&1; then break; fi
  sleep 5
done

info "Cargando datos iniciales…"
docker compose exec -T api node dist/prisma-seed/seed.js

# ---------------------------------------------------------------- Resumen
if [[ "$MODE" == "1" ]]; then
  bash deploy/tunel-url.sh
else
  cat <<EOF

=====================================================================
  ✅ Aplicación desplegada:   https://${DOMAIN}
=====================================================================
  En Google Cloud → Clientes → su ID de cliente OAuth, agregue:
    Orígenes autorizados de JavaScript:   https://${DOMAIN}
    URI de redireccionamiento autorizados: https://${DOMAIN}/api/v1/auth/google/callback

  El certificado HTTPS requiere que los puertos 80 y 443 lleguen a este servidor.
  Revise:  sudo docker compose logs caddy
=====================================================================
EOF
fi

if [[ -z "$(get_env GOOGLE_CLIENT_ID)" ]]; then
  cat <<EOF

  [!] Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en ${PROJECT_DIR}/.env
      Complételos y aplique con:   sudo docker compose up -d
EOF
fi
cat <<EOF

  Estado:     sudo docker compose ps
  Registros:  sudo docker compose logs -f api
  Respaldos:  ${PROJECT_DIR}/backups
EOF
