#!/usr/bin/env bash
# ============================================================================
# Atlas — server initialization for Ubuntu 24.04 (LTS)
#
#   curl -fsSL .../server-init.sh | sudo bash
#   # or: sudo bash server-init.sh
#
# Idempotent. Installs Docker + Compose plugin, host nginx, certbot, fail2ban,
# configures the firewall, swap, unattended security upgrades, and lays out the
# /opt/atlas deploy directory. Safe to re-run.
# ============================================================================
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)."; exit 1; fi

APP_DIR="/opt/atlas"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
log() { echo -e "\n\033[1;32m==> $*\033[0m"; }

# ── 1. Base packages ────────────────────────────────────────────────────────
log "Updating apt and installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release ufw fail2ban nginx \
  certbot python3-certbot-nginx logrotate unattended-upgrades apt-listchanges \
  git jq

# ── 2. Docker Engine + Compose plugin (official repo) ───────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine + Compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  log "Docker already installed: $(docker --version)"
fi
systemctl enable --now docker

# ── 3. Docker daemon hardening + log rotation defaults ──────────────────────
log "Configuring Docker daemon (log rotation, live-restore)"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true,
  "userland-proxy": false
}
JSON
systemctl restart docker

# ── 4. Deploy user (runs compose, member of docker group) ───────────────────
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  log "Creating deploy user '$DEPLOY_USER'"
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

# ── 5. App directory layout ─────────────────────────────────────────────────
log "Preparing $APP_DIR"
mkdir -p "$APP_DIR" "$APP_DIR/backups" /var/log/atlas
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR" /var/log/atlas

# ── 6. Firewall (ufw): SSH + HTTP + HTTPS only ──────────────────────────────
log "Configuring ufw firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── 7. fail2ban (sshd + nginx jails enabled separately by deploy/fail2ban) ──
log "Enabling fail2ban"
systemctl enable --now fail2ban

# ── 8. Swap (2G) for small instances — skip if already present ──────────────
if ! swapon --show | grep -q '/swapfile'; then
  log "Creating 2G swapfile"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

# ── 9. Unattended security upgrades ─────────────────────────────────────────
log "Enabling unattended security upgrades"
echo 'APT::Periodic::Update-Package-Lists "1";' > /etc/apt/apt.conf.d/20auto-upgrades
echo 'APT::Periodic::Unattended-Upgrade "1";' >> /etc/apt/apt.conf.d/20auto-upgrades

# ── 10. Host nginx: ready, certs come from ssl-init.sh ──────────────────────
systemctl enable --now nginx

cat <<DONE

============================================================================
 Server initialized.

 Next:
   1) Copy the repo / compose files into $APP_DIR (CI does this over SSH).
   2) Install host nginx vhosts:
        cp deploy/nginx/*.conf /etc/nginx/sites-available/
        ln -sf /etc/nginx/sites-available/atlas-www.conf /etc/nginx/sites-enabled/
        ln -sf /etc/nginx/sites-available/atlas-api.conf /etc/nginx/sites-enabled/
        nginx -t && systemctl reload nginx
   3) Issue TLS certificates:
        sudo bash deploy/ssl-init.sh
   4) Install fail2ban jails:
        cp deploy/fail2ban/jail.local /etc/fail2ban/ && systemctl restart fail2ban
   5) Schedule backups (deploy/backup.sh) via cron — see PRODUCTION.md.

 Deploy user: $DEPLOY_USER   App dir: $APP_DIR
============================================================================
DONE
