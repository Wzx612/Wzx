# Atlas — Production Go-Live Runbook

Push-to-deploy production setup: a developer runs `git push origin main` and CI
builds → tests → builds images → pushes to GHCR → SSHes to the server → rolls
out the new version with health gating. No manual server login required.

> **Stack note:** This project is **Python / FastAPI**, not SpringBoot/Java. The
> request's "SpringBoot monitoring" and "JVM optimization" items are adapted
> faithfully to the real stack: **FastAPI `/metrics`** (Prometheus instrumentator,
> the Actuator equivalent) and **uvicorn-workers + SQLAlchemy connection-pool**
> tuning (the JVM equivalent).

---

## 0. File map (everything generated)

```
.github/workflows/deploy.yml      CI/CD pipeline (push main → deploy)
Dockerfile.frontend               gateway image: built SPA + nginx routing
backend/Dockerfile                backend image (non-root, CPU torch, tini)
backend/init.sql                  schema + pgvector + indexes (auto on first boot)
docker-compose.yml                base stack (8 services)
docker-compose.prod.yml           prod overrides (registry images, restart, logging, TLS-fronting)
docker-compose.monitoring.yml     Prometheus + Grafana + exporters
nginx.conf                        container gateway routing (baked into gateway image)
.env.prod.example                 production env template
monitoring/prometheus.yml         scrape config (host, containers, pg, redis, app)
monitoring/alerts.yml             alert rules
monitoring/grafana/...            datasource + dashboard provisioning
deploy/server-init.sh             Ubuntu 24.04 provisioning
deploy/ssl-init.sh                Let's Encrypt issuance + auto-renew
deploy/nginx/atlas-www.conf       host vhost: frontend (www, apex)
deploy/nginx/atlas-api.conf       host vhost: API (api.*)
deploy/nginx/conf.d/...           gzip, proxy-cache, rate-limit zones
deploy/nginx/snippets/...         security headers
deploy/deploy.sh                  health-gated rolling deploy (CI calls this)
deploy/rollback.sh                revert to a previous tag
deploy/backup.sh / restore.sh     nightly pg_dump + restore
deploy/archive-errors.sh          daily error-log archival
deploy/logrotate/atlas            host log rotation
deploy/fail2ban/jail.local        SSH + nginx brute-force protection
```

---

## 1. System architecture (logical)

```
   Developer ──git push main──► GitHub ──Actions──► GHCR (images)
                                                       │ pull (CD over SSH)
                                                       ▼
 ┌──────────────────────────── Ubuntu 24.04 server ───────────────────────────┐
 │  Internet :443/:80                                                          │
 │      │                                                                      │
 │      ▼                                                                      │
 │  ┌───────────────┐   TLS termination (Let's Encrypt) + gzip + cache +      │
 │  │  host nginx   │   security headers + rate-limit + fail2ban              │
 │  │  www. / api.  │                                                          │
 │  └──────┬────────┘                                                          │
 │         │ proxy → 127.0.0.1:8080                                            │
 │  ┌──────▼─────────────── docker network: atlas-net ───────────────────────┐ │
 │  │  ┌───────────────┐  path routing                                       │ │
 │  │  │ gateway nginx │  /  → SPA   /api/* → services                       │ │
 │  │  └──┬─────┬─────┬┘                                                      │ │
 │  │     │     │     └───────────────► agent-service ─┐ Knowledge Agent      │ │
 │  │     │     └─────► rag-service ───┐               │ multimodal/vision    │ │
 │  │     └─► embedding-service ◄──────┴── HTTP embed ─┘ (remote mode)        │ │
 │  │            │ (BGE model, loaded once)                                   │ │
 │  │     ┌──────┴──────────────┬───────────────────┐                        │ │
 │  │     ▼                     ▼                   ▼                        │ │
 │  │  PostgreSQL+pgvector    Redis (cache)      MinIO (objects)             │ │
 │  │                                                                        │ │
 │  │  Prometheus ◄─ node-exporter / cAdvisor / pg-exporter / redis-exporter │ │
 │  │  Grafana    ◄─ Prometheus      app /metrics ◄─ embedding/rag/agent     │ │
 │  └────────────────────────────────────────────────────────────────────────┘ │
 │         │ egress                                                            │
 │         ▼                                                                    │
 │   DashScope (Qwen-VL-Max)  ·  DeepSeek Chat API                             │
 └────────────────────────────────────────────────────────────────────────────┘
```

## 2. Deployment architecture (CI/CD pipeline)

```
 git push main
      │
      ▼
 ┌──────────────────────── GitHub Actions ─────────────────────────┐
 │ job test          : pgvector service → init.sql → pytest        │
 │      │ needs                                                     │
 │ job build-push    : matrix[backend, gateway]                    │
 │      │              docker buildx → push ghcr.io/<owner>/*       │
 │      │ needs                                                     │
 │ job deploy        : ssh → /opt/atlas → deploy/deploy.sh <sha>   │
 └─────────────────────────────┬───────────────────────────────────┘
                               │ SSH (key)
                               ▼
                    server: docker compose pull
                            rolling up -d (health-gated)
                            auto-rollback on failure
```

## 3. Network topology

```
            ┌──────────────────────── host ───────────────────────────┐
 Public ───►│ :80  :443        (host nginx — only public listeners)     │
            │   │                                                       │
            │   ▼ proxy_pass                                            │
            │ 127.0.0.1:8080   gateway (container)                      │
            │ 127.0.0.1:9090   prometheus   } loopback only —           │
            │ 127.0.0.1:3000   grafana      } reach via SSH tunnel      │
            │ 127.0.0.1:9001   minio console}                           │
            │                                                           │
            │  ┌────────── atlas-net (bridge, internal) ─────────────┐  │
            │  │ gateway → embedding/rag/agent :8000                 │  │
            │  │ rag/agent → embedding:8000 (remote embed)           │  │
            │  │ apps → postgres:5432, redis:6379, minio:9000        │  │
            │  │ exporters → pg/redis/cadvisor/node                  │  │
            │  └─────────────────────────────────────────────────────┘  │
            │   firewall (ufw): allow 22, 80, 443; deny the rest        │
            └───────────────────────────────────────────────────────────┘
                         │ egress: DashScope, DeepSeek, GHCR, HuggingFace
                         ▼
```

## 4. Docker deployment structure

| Kind | Name | Notes |
|------|------|-------|
| Image | `ghcr.io/<owner>/atlas-backend` | one image, 3 roles (env-differentiated), non-root |
| Image | `ghcr.io/<owner>/atlas-gateway` | SPA + nginx routing baked |
| Service | `embedding-service` | BGE model host (1 worker) |
| Service | `rag-service` / `agent-service` | remote-embed; N workers |
| Service | `nginx` (gateway) | path routing; loopback-bound |
| Service | `postgres` / `redis` / `minio` (+`minio-init`) | data layer |
| Service | `prometheus`/`grafana`/`*-exporter`/`cadvisor` | monitoring |
| Volume | `postgres_data` `redis_data` `minio_data` `model_cache` `prometheus_data` `grafana_data` | persistence |
| Network | `atlas-net` (bridge) | all internal traffic |

---

## 5. One-time server setup

```bash
# On the Ubuntu 24.04 server (as root)
git clone <repo> /opt/atlas && cd /opt/atlas        # or CI seeds this dir
sudo bash deploy/server-init.sh                      # docker, nginx, ufw, fail2ban, swap

# App config + secrets
cp .env.prod.example .env                            # edit domains, passwords, REGISTRY_IMAGE
cp backend/.env.example backend/.env                 # set DASHSCOPE_API_KEY, DEEPSEEK_API_KEY

# Host nginx vhosts
cp deploy/nginx/conf.d/atlas-optimization.conf /etc/nginx/conf.d/
mkdir -p /etc/nginx/snippets
cp deploy/nginx/snippets/atlas-security-headers.conf /etc/nginx/snippets/
sed -i "s/example.com/$DOMAIN/g" deploy/nginx/atlas-*.conf
cp deploy/nginx/atlas-www.conf /etc/nginx/sites-available/
cp deploy/nginx/atlas-api.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/atlas-www.conf /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/atlas-api.conf /etc/nginx/sites-enabled/
mkdir -p /var/cache/nginx/atlas && nginx -t && systemctl reload nginx

# TLS (Let's Encrypt, auto-renew)
sudo bash deploy/ssl-init.sh

# Security/ops
cp deploy/fail2ban/jail.local /etc/fail2ban/ && systemctl restart fail2ban
cp deploy/logrotate/atlas /etc/logrotate.d/atlas

# Backups + error archival (deploy user crontab)
( crontab -l 2>/dev/null;
  echo "0 3 * * * /opt/atlas/deploy/backup.sh >> /var/log/atlas/backup.log 2>&1";
  echo "30 3 * * * /opt/atlas/deploy/archive-errors.sh >> /var/log/atlas/archive.log 2>&1"
) | crontab -
```

## 6. DNS configuration

Create these records at your DNS provider (A or AAAA → server IP):

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| A | `@` (apex `example.com`) | `<SERVER_IP>` | redirects to www |
| A | `www` | `<SERVER_IP>` | frontend SPA |
| A | `api` | `<SERVER_IP>` | backend API |
| A | `grafana` *(optional)* | `<SERVER_IP>` | monitoring UI |

Front/back are separated at the subdomain level: `www`/apex serve the SPA,
`api` serves only `/api/*`. The SPA calls `https://api.<domain>` (set
`VITE_API_BASE` / `ALLOWED_ORIGINS` accordingly).

## 7. GitHub repository setup — Secrets & Variables

**Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Purpose |
|--------|---------|
| `SSH_HOST` | server IP / hostname |
| `SSH_USER` | deploy user (e.g. `deploy`) |
| `SSH_KEY` | private key whose public key is in the deploy user's `~/.ssh/authorized_keys` |
| `SSH_PORT` | optional (default 22) |
| `REGISTRY_USERNAME` | GitHub username (for server to pull from GHCR) |
| `REGISTRY_TOKEN` | PAT with `read:packages` (server-side pull) |

`GITHUB_TOKEN` is provided automatically and is used by CI to **push** to GHCR
(`packages: write`). No Docker Hub account needed; to use Docker Hub instead,
change `REGISTRY`/image names in `deploy.yml` and login with `DOCKERHUB_TOKEN`.

Add a GitHub **Environment** named `production` (optional: require reviewers for
manual approval before the deploy job).

## 8. Push-to-deploy

```bash
git push origin main
```
Pipeline: **Checkout → Build deps → Test → Docker Build → Docker Push → SSH → Deploy.**
`deploy/deploy.sh` performs a **health-gated rolling update** and **auto-rolls
back** to the previous tag if any service fails its healthcheck.

## 9. Manual operations

```bash
cd /opt/atlas
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.monitoring.yml"

$C ps                       # status
$C logs -f rag-service      # tail logs
$C pull && $C up -d         # manual update to pinned IMAGE_TAG
bash deploy/deploy.sh <tag> # deploy a specific tag
bash deploy/rollback.sh     # revert to last good tag (.rollback_tag)
bash deploy/backup.sh       # on-demand DB backup
bash deploy/restore.sh backups/atlas_atlas_YYYYMMDD_HHMMSS.sql.gz --yes
```

## 10. Zero-downtime & self-healing

- **Auto-recovery:** every service has `restart: always` + a Docker healthcheck;
  crashed/unhealthy containers are restarted automatically. `live-restore` keeps
  containers running across Docker daemon restarts.
- **Rolling deploy:** `deploy.sh` updates one service at a time and waits for
  `healthy` before the next. embedding-service rolls first; rag/agent absorb its
  brief restart via built-in HTTP **retry/backoff** on the embed call.
- **Edge resilience:** host nginx stays up across backend rollouts; the gateway
  is updated last.
- **Limitation (be honest):** each app service runs a single replica, so a
  recreate has a sub-second window. For true 0-downtime, scale replicas
  (`--scale rag-service=2`) behind the gateway and add `proxy_next_upstream`.

## 11. Database backup plan

- **Persistence:** `postgres_data` named volume (survives container recreation).
- **Schedule:** `deploy/backup.sh` via cron daily at **03:00**.
- **Format:** `pg_dump --clean --if-exists | gzip` → `BACKUP_DIR/atlas_*.sql.gz`.
- **Retention:** **7 days** (`BACKUP_RETENTION_DAYS`), older dumps pruned.
- **Integrity:** each dump is `gzip -t` verified; invalid dumps are discarded.
- **Restore:** `deploy/restore.sh <file> --yes` (destructive, drops & recreates).
- **Offsite (optional):** uncomment the S3 line in `backup.sh`.

## 12. Monitoring

- **Prometheus** (`:9090`) scrapes: host (node-exporter), containers (cAdvisor),
  Postgres, Redis, and app `/metrics` (FastAPI). Alerts in `monitoring/alerts.yml`.
- **Grafana** (`:3000`) auto-provisioned with the Prometheus datasource and the
  **Atlas — Overview** dashboard (CPU, memory, disk, network, containers,
  request rate, p95 latency, service-up).
- Access via SSH tunnel: `ssh -L 3000:127.0.0.1:3000 deploy@server` → http://localhost:3000.

## 13. Production optimization (applied)

| Area | What | Where |
|------|------|-------|
| nginx gzip | text/json/js/css/svg/fonts | `deploy/nginx/conf.d/atlas-optimization.conf` |
| Static cache | edge micro-cache + 30-day immutable browser cache | `atlas-www.conf` |
| Proxy cache | `atlas_cache` zone, stale-while-revalidate | optimization.conf |
| Redis cache | query-embedding cache (fail-open) | `EmbeddingService` |
| "JVM" → Python | uvicorn workers per service (`RAG_WORKERS`/`AGENT_WORKERS`) | prod compose |
| DB pool | `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`/recycle | `config.py` + `database.py` |

## 14. Security hardening (applied)

- **fail2ban**: sshd + nginx-limit-req/http-auth/botsearch jails.
- **ufw**: only 22/80/443 inbound.
- **Security headers**: HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy.
- **Docker**: non-root image user, `no-new-privileges`, daemon `userland-proxy:false`,
  loopback-only binding of data/monitoring ports, bounded json-file logs.
- **Secrets**: kept in `.env` / `backend/.env` (chmod 600, gitignored); CI secrets
  in GitHub Actions; GHCR pull via scoped PAT. Never baked into images
  (`.dockerignore` excludes `.env`).

---

## 15. Rollback plan

| Scenario | Action |
|----------|--------|
| Deploy fails healthcheck | **Automatic** — `deploy.sh` calls `rollback.sh` with `.rollback_tag`. |
| Bad release noticed later | `bash deploy/rollback.sh <previous-sha-tag>` (tags are `sha-<gitsha>`, immutable in GHCR). |
| Re-deploy a known good | `bash deploy/deploy.sh sha-<gitsha>`. |
| DB corruption | `bash deploy/restore.sh <latest-backup> --yes`, then restart app services. |
| Full stop | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down` (volumes preserved). |

Every image is tagged with the immutable git SHA, so any prior version can be
re-pulled and re-run at any time.

---

## 16. Startup commands (quick reference)

```bash
# Full production stack (app + monitoring)
cd /opt/atlas
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               -f docker-compose.monitoring.yml up -d

# App only (no monitoring)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Local dev (build locally, no registry)
docker compose up -d
```
