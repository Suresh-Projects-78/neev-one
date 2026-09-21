#!/usr/bin/env bash
#
# Push this working copy to the live server.
#
#   ./deploy.sh          frontend only — the common case, a few seconds
#   ./deploy.sh --api    frontend and API: reinstalls deps, applies schema
#                        changes, rebuilds and restarts the service
#   ./deploy.sh --status what is running right now, and who is deploying
#   ./deploy.sh --unlock clear a lock left by a deployer that died mid-run
#
# One deployment at a time. On 18 Sep 2026 two machines deployed the same
# commit eight minutes apart — the second swept the first's hashed bundle
# while browsers still held a page pointing at it — and the forensics took
# longer than the deploys. So a deploy takes a lock ON THE SERVER first (the
# only place both machines can see), records who and what and when, and a
# second deploy refuses rather than overwriting. The lock is released on any
# exit, including failure and Ctrl-C; only a dead process leaves one behind,
# which is what --unlock is for. Every start and end is appended to
# /opt/neev/deploy.log so the next question of "what changed at 10:16?" has
# an answer.
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

# Who is deploying what. The SHA gains "-dirty" when the tree has uncommitted
# changes, because a bundle built from a dirty tree matches no commit anyone
# can check out later — which is exactly the thing worth knowing about it.
LOCK=/opt/neev/deploy.lock
DEPLOY_LOG=/opt/neev/deploy.log
DEPLOYER="${USER:-$(whoami)}@$(hostname -s)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
[ -n "$(git status --porcelain 2>/dev/null)" ] && SHA="${SHA}-dirty"
MODE=frontend; [ "${1:-}" = "--api" ] && MODE=frontend+api
STAMP='$(date -u +%Y-%m-%dT%H:%M:%SZ)'   # expanded on the server, not here

# Prints the lock's contents and its age, for --status, --unlock and the
# refusal message. Silent when there is no lock.
show_lock() {
  "${SSH[@]}" "[ -d '$LOCK' ] || exit 0
    cat '$LOCK/info'
    s=\$(sed -n 's/^started_epoch=//p' '$LOCK/info'); now=\$(date -u +%s)
    [ -n \"\$s\" ] && echo \"age=\$((now - s))s\""
}

if [ "${1:-}" = "--status" ]; then
  "${SSH[@]}" 'systemctl is-active neev-api caddy | paste -sd" / " -; echo; free -m | head -2; echo; du -sh /opt/neev/data/prod.db 2>/dev/null || echo "no database yet"'
  printf '\napp: '; curl -s -o /dev/null -w '%{http_code}\n' --max-time 20 "$URL/"
  step "Deployment lock"
  if "${SSH[@]}" "[ -d '$LOCK' ]"; then
    echo "  IN PROGRESS:"; show_lock | sed 's/^/    /'
  else
    echo "  none — nobody is deploying"
  fi
  step "Last deployments"
  "${SSH[@]}" "tail -n 6 '$DEPLOY_LOG' 2>/dev/null || echo '  (no deploy.log yet)'" | sed 's/^/  /'
  exit 0
fi

if [ "${1:-}" = "--unlock" ]; then
  # Judge staleness from the age it prints before you reach for this. A lock
  # a few seconds old with a live deployer behind it is not stale.
  if ! "${SSH[@]}" "[ -d '$LOCK' ]"; then
    echo "No lock to clear."; exit 0
  fi
  step "Clearing deployment lock"
  show_lock | sed 's/^/  /'
  "${SSH[@]}" "printf '%s UNLOCK by=%s\n' \"$STAMP\" '$DEPLOYER' >> '$DEPLOY_LOG'; rm -rf '$LOCK'"
  echo "Cleared."
  exit 0
fi

# ---- take the lock, before spending a build on a deploy that will refuse ----
step "Acquiring deployment lock as $DEPLOYER ($SHA, $MODE)"
# mkdir is atomic: two deployers racing get exactly one success. The info file
# is written only by the one that won.
if ! "${SSH[@]}" "mkdir '$LOCK' 2>/dev/null \
     && printf 'sha=%s\ndeployer=%s\nmode=%s\nstarted=%s\nstarted_epoch=%s\n' '$SHA' '$DEPLOYER' '$MODE' \"$STAMP\" \"\$(date -u +%s)\" > '$LOCK/info' \
     && printf '%s START sha=%s deployer=%s mode=%s\n' \"$STAMP\" '$SHA' '$DEPLOYER' '$MODE' >> '$DEPLOY_LOG'"; then
  printf '\n\033[1;31mANOTHER DEPLOYMENT IS IN PROGRESS\033[0m — refusing to overwrite it.\n' >&2
  show_lock | sed 's/^/  /' >&2
  printf '\nIf that deployer is gone (crashed, or Ctrl-C with no cleanup), clear it with:\n  ./deploy.sh --unlock\n' >&2
  exit 1
fi
LOCKED=1

# Released on every exit — success, `set -e` failure, or Ctrl-C — with the
# outcome written to the log. A lock that outlives its deploy is worse than
# none, because it turns the next honest deploy into a false alarm.
release_lock() {
  local rc=$?
  [ "${LOCKED:-0}" = 1 ] || return 0
  local outcome=ok; [ "$rc" -eq 0 ] || outcome="failed rc=$rc"
  "${SSH[@]}" "printf '%s END   sha=%s deployer=%s outcome=%s\n' \"$STAMP\" '$SHA' '$DEPLOYER' '$outcome' >> '$DEPLOY_LOG'; rm -rf '$LOCK'" \
    || printf '\n\033[1;31mWARNING\033[0m: could not release %s on the server — run ./deploy.sh --unlock\n' "$LOCK" >&2
}
trap release_lock EXIT

step "Building frontend locally"
npx vite build >/dev/null
du -sh dist | awk '{print "  " $1 " of static files"}'

step "Uploading frontend"
# Two passes, and the order is the point.
#
# One rsync with --delete removes the old hashed bundle in the same breath as
# it writes the new index.html, so anybody whose browser fetched the page a
# second earlier asks for a file that no longer exists: a blank screen and a
# 404 on a bundle nobody can explain. Uploading the new assets first means the
# old page still works while the swap happens, and the stale files go only
# after the new index.html is in place and pointing elsewhere.
# 1. New assets alongside the old ones — nothing is removed yet.
rsync -az -e "ssh -i $KEY" dist/assets/ "ubuntu@$HOST:/opt/neev/web/assets/"
# 2. index.html and the rest, now that what it points at is already there.
rsync -az --exclude assets -e "ssh -i $KEY" dist/ "ubuntu@$HOST:/opt/neev/web/"
# 3. Only now sweep what the new build no longer references.
rsync -az --delete -e "ssh -i $KEY" dist/ "ubuntu@$HOST:/opt/neev/web/"

if [ "${1:-}" = "--api" ]; then
  step "Uploading API source"
  rsync -az --delete \
    --exclude node_modules --exclude 'prisma/*.db' --exclude dist \
    -e "ssh -i $KEY" server/ "ubuntu@$HOST:/opt/neev/server/"

  step "Installing, migrating and rebuilding on the server"
  # db push applies what the schema needs. It is safe to repeat for an ADDITIVE
  # change — a new table, a new nullable column — and it is not safe for one
  # that tightens a constraint, which can refuse or take rows with it. Run
  # `npx tsx scripts/preflight.ts` against the live database before deploying a
  # schema change; it names anything that would be lost.
  #
  # Its output is kept, unlike the other steps. `set -e` already aborts the
  # deploy when push fails, but silencing it meant the failure arrived with no
  # reason attached and the schema half applied.
  "${SSH[@]}" 'set -e
    cd /opt/neev/server
    set -a; . /opt/neev/.env; set +a
    # --include=dev explicitly: the .env sourced above sets NODE_ENV=production,
    # which makes npm skip devDependencies, and tsc is one of them.
    npm ci --include=dev --no-audit --no-fund >/dev/null 2>&1
    npx prisma generate >/dev/null 2>&1
    # Payroll keeps its own database, so it has its own client.
    npx prisma generate --schema prisma/payroll/schema.prisma >/dev/null 2>&1
    # See the CI workflow: the check earns the flag rather than the flag being
    # passed blindly. It exits 1 when something would really be lost, and
    # `set -e` stops the deploy before the schema is touched.
    npx tsx scripts/preflight.ts
    # Versioned migrations, and a one-time baseline for the database db push
    # built. See server/prisma/migrations/README.md.
    npx tsx scripts/migrate.ts
    # Every addition to the permission catalogue leaves existing Owner roles
    # short of it — the seed runs once, at org creation. Four of six live orgs
    # were missing 92 grants between them, which is why a settings page added
    # after their signup simply never appeared in their menu. Idempotent: it
    # prints "nothing to do" when the catalogue and the grants agree.
    npx tsx scripts/backfillOwnerPermissions.ts --fix
    npm run build >/dev/null 2>&1
    sudo systemctl restart neev-api'
fi

step "Checking it came back up"
"${SSH[@]}" 'systemctl is-active neev-api caddy | paste -sd" / " -'
printf 'app: '; curl -s -o /dev/null -w '%{http_code}\n' --max-time 25 "$URL/"
printf 'api: '; curl -s -w ' [%{http_code}]\n' --max-time 25 "$URL/api/health"

printf '\n\033[1mLive:\033[0m %s\n' "$URL"
