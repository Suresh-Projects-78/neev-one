#!/usr/bin/env bash
#
# Push this working copy to the live server.
#
#   ./deploy.sh          frontend only — the common case, a few seconds
#   ./deploy.sh --api    frontend and API: reinstalls deps, applies schema
#                        changes, rebuilds and restarts the service
#   ./deploy.sh --status what is running right now
#
# The frontend is built HERE, never on the server. The box has 954 MB of RAM
# and a Vite build peaks well above that; the build output is just static
# files, so it does not care which machine produced it. This is the whole
# reason a 1 GB instance is enough to run this app.
set -euo pipefail

cd "$(dirname "$0")"

HOST="${NEEV_HOST:-68.233.107.83}"
KEY="${NEEV_KEY:-$HOME/.ssh/neevone}"
URL="${NEEV_URL:-https://68.233.107.83.sslip.io}"
SSH=(ssh -i "$KEY" -o ConnectTimeout=20 "ubuntu@$HOST")

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [ "${1:-}" = "--status" ]; then
  "${SSH[@]}" 'systemctl is-active neev-api caddy | paste -sd" / " -; echo; free -m | head -2; echo; du -sh /opt/neev/data/prod.db 2>/dev/null || echo "no database yet"'
  printf '\napp: '; curl -s -o /dev/null -w '%{http_code}\n' --max-time 20 "$URL/"
  exit 0
fi

step "Building frontend locally"
npx vite build >/dev/null
du -sh dist | awk '{print "  " $1 " of static files"}'

step "Uploading frontend"
rsync -az --delete -e "ssh -i $KEY" dist/ "ubuntu@$HOST:/opt/neev/web/"

if [ "${1:-}" = "--api" ]; then
  step "Uploading API source"
  rsync -az --delete \
    --exclude node_modules --exclude 'prisma/*.db' --exclude dist \
    -e "ssh -i $KEY" server/ "ubuntu@$HOST:/opt/neev/server/"

  step "Installing, migrating and rebuilding on the server"
  # db push is safe to repeat: it only applies what the schema needs, and
  # leaves the data alone.
  "${SSH[@]}" 'set -e
    cd /opt/neev/server
    set -a; . /opt/neev/.env; set +a
    npm ci --no-audit --no-fund >/dev/null 2>&1
    npx prisma generate >/dev/null 2>&1
    npx prisma db push --skip-generate >/dev/null 2>&1
    npm run build >/dev/null 2>&1
    sudo systemctl restart neev-api'
fi

step "Checking it came back up"
"${SSH[@]}" 'systemctl is-active neev-api caddy | paste -sd" / " -'
printf 'app: '; curl -s -o /dev/null -w '%{http_code}\n' --max-time 25 "$URL/"
printf 'api: '; curl -s -w ' [%{http_code}]\n' --max-time 25 "$URL/api/health"

printf '\n\033[1mLive:\033[0m %s\n' "$URL"
