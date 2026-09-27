#!/usr/bin/env bash
# =============================================================================
#  Instalación del Sistema de Citas UETS en Ubuntu Server (22.04 / 24.04)
#
#  Uso (desde la carpeta del proyecto):
#     sudo bash deploy/instalar-ubuntu.sh            # detecta la IP pública
#     sudo bash deploy/instalar-ubuntu.sh 200.1.2.3  # o indíquela manualmente
#
#  Qué hace:
#   1. Instala Docker y Docker Compose (paquetes oficiales de Ubuntu)
#   2. Abre los puertos 80 y 443 en el firewall (si UFW está activo)
#   3. Arma el dominio gratuito  citas.<IP-con-guiones>.sslip.io
#   4. Crea el archivo .env con secretos aleatorios (solo si no existe)
#   5. Construye y levanta la app con HTTPS automático (Caddy + Let's Encrypt)
#   6. Carga los datos iniciales (configuración, admin, doctor, períodos)
#  Se puede ejecutar varias veces sin perder datos.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

info() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Ejecute con sudo:  sudo bash deploy/instalar-ubuntu.sh"
  exit 1
fi

# ---------------------------------------------------------------- 1. Docker
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  info "Instalando Docker y Docker Compose…"
  apt-get update -y
  apt-get install -y docker.io docker-compose-v2 curl openssl
  systemctl enable --now docker
else
  info "Docker ya está instalado: $(docker --version)"
fi

# ---------------------------------------------------------------- 2. Firewall
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  info "Abriendo puertos 80 y 443 en UFW…"
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
fi

# ---------------------------------------------------------------- 3. Dominio
IP="${1:-}"
if [[ -z "$IP" ]]; then
  IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
fi
if ! [[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  echo "No se pudo detectar la IP pública. Indíquela:  sudo bash deploy/instalar-ubuntu.sh 200.1.2.3"
  exit 1
fi
DOMAIN="citas.${IP//./-}.sslip.io"
info "Dominio de la aplicación: https://${DOMAIN}"

# ---------------------------------------------------------------- 4. .env
set_env() { # set_env CLAVE VALOR  (crea o reemplaza la línea en .env)
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

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
  info "Se conserva el .env existente (solo se actualiza el dominio)."
fi
set_env APP_DOMAIN "$DOMAIN"
set_env WEB_URL "https://${DOMAIN}"
set_env GOOGLE_REDIRECT_URI "https://${DOMAIN}/api/v1/auth/google/callback"

# ---------------------------------------------------------------- 5. Levantar
info "Construyendo y levantando la aplicación (la primera vez tarda varios minutos)…"
docker compose --profile prod up -d --build

info "Esperando a que la API esté lista…"
for _ in $(seq 1 60); do
  if docker compose exec -T api wget -qO- http://localhost:3000/api/v1/health >/dev/null 2>&1; then break; fi
  sleep 5
done

# ---------------------------------------------------------------- 6. Datos iniciales
info "Cargando datos iniciales…"
docker compose exec -T api npx ts-node --transpile-only prisma/seed.ts

# ---------------------------------------------------------------- Resumen
GOOGLE_ID="$(grep '^GOOGLE_CLIENT_ID=' .env | cut -d= -f2- || true)"
cat <<EOF

=====================================================================
  ✅ Aplicación desplegada:   https://${DOMAIN}
=====================================================================
  En Google Cloud → Clientes → su ID de cliente OAuth, agregue:

    Orígenes autorizados de JavaScript:
      https://${DOMAIN}

    URI de redireccionamiento autorizados:
      https://${DOMAIN}/api/v1/auth/google/callback

  El certificado HTTPS se obtiene en el primer minuto. Si la página no abre,
  verifique que los puertos 80 y 443 lleguen al servidor:  sudo docker compose logs caddy
EOF
if [[ -z "$GOOGLE_ID" ]]; then
  cat <<EOF

  [!] Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en ${PROJECT_DIR}/.env
      Complételos y aplique con:   sudo docker compose --profile prod up -d
EOF
fi
cat <<EOF

  Estado:     sudo docker compose ps
  Registros:  sudo docker compose logs -f caddy api
  Respaldos:  ${PROJECT_DIR}/backups
=====================================================================
EOF
