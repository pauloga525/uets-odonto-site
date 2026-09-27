#!/usr/bin/env bash
# =============================================================================
#  Muestra la dirección actual del túnel rápido de Cloudflare y las URIs que
#  deben estar registradas en Google Cloud.
#
#  Uso:  sudo bash deploy/tunel-url.sh
#
#  La dirección *.trycloudflare.com cambia cuando el contenedor del túnel se
#  reinicia (reinicio del servidor, actualización, etc.). La app se adapta sola;
#  solo hay que actualizar las dos direcciones en Google.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

URL=""
for _ in $(seq 1 30); do
  URL="$(docker compose logs tunnel 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
  [[ -n "$URL" ]] && break
  sleep 2
done

if [[ -z "$URL" ]]; then
  echo "No se encontró la dirección del túnel."
  echo "Verifique que esté corriendo:  sudo docker compose ps tunnel"
  echo "Registros:                     sudo docker compose logs tunnel"
  exit 1
fi

cat <<EOF

=====================================================================
  🌐 Dirección actual de la aplicación:   ${URL}
=====================================================================
  En Google Cloud → Clientes → su ID de cliente OAuth → reemplace las
  direcciones trycloudflare anteriores por estas:

    Orígenes autorizados de JavaScript:
      ${URL}

    URI de redireccionamiento autorizados:
      ${URL}/api/v1/auth/google/callback

  (Google puede tardar unos minutos en aplicar el cambio.)
=====================================================================
EOF
