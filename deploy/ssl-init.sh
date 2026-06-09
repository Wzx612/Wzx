#!/usr/bin/env bash
# ============================================================================
# Atlas — Let's Encrypt TLS issuance + auto-renewal (Ubuntu 24.04 host nginx)
#
#   sudo bash deploy/ssl-init.sh
#
# Reads DOMAIN / WWW_DOMAIN / API_DOMAIN / LETSENCRYPT_EMAIL from the deploy
# .env (or environment). Obtains certificates via the certbot nginx plugin and
# verifies auto-renewal. certbot installs a systemd timer (certbot.timer) that
# renews twice daily; we add a deploy hook to reload nginx after renewal.
# ============================================================================
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)."; exit 1; fi

# Load deploy env if present (so DOMAIN/EMAIL come from .env)
ENV_FILE="${ENV_FILE:-/opt/atlas/.env}"
[[ -f "$ENV_FILE" ]] && set -a && . "$ENV_FILE" && set +a

DOMAIN="${DOMAIN:?set DOMAIN}"
WWW_DOMAIN="${WWW_DOMAIN:-www.$DOMAIN}"
API_DOMAIN="${API_DOMAIN:-api.$DOMAIN}"
EMAIL="${LETSENCRYPT_EMAIL:?set LETSENCRYPT_EMAIL}"
EXTRA_DOMAINS="${EXTRA_DOMAINS:-}"   # e.g. "grafana.$DOMAIN"

echo "==> Issuing certificates for: $DOMAIN $WWW_DOMAIN $API_DOMAIN $EXTRA_DOMAINS"

# nginx must be serving the http-01 challenge; vhosts should already be enabled.
nginx -t && systemctl reload nginx

DOMAIN_ARGS=(-d "$DOMAIN" -d "$WWW_DOMAIN" -d "$API_DOMAIN")
for d in $EXTRA_DOMAINS; do DOMAIN_ARGS+=(-d "$d"); done

certbot --nginx \
  --non-interactive --agree-tos --redirect \
  -m "$EMAIL" \
  "${DOMAIN_ARGS[@]}"

# ── Auto-renewal: certbot.timer handles renewal; add an nginx reload hook ────
echo "==> Installing post-renewal nginx reload hook"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/usr/bin/env bash
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

systemctl enable --now certbot.timer

echo "==> Verifying renewal (dry-run)"
certbot renew --dry-run

echo "============================================================================"
echo " TLS ready. Certificates auto-renew via certbot.timer (twice daily check)."
echo " Next renewal status:  systemctl list-timers certbot.timer"
echo "============================================================================"
