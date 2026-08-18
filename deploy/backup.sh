#!/usr/bin/env sh
# Nightly SQLite backup for the api container's volume.
#
# SQLite's own .backup command is used (via a throwaway container) rather
# than copying the file: a plain copy of a database mid-write is corrupt.
# Keeps the most recent 30 archives.
#
# Cron example (2:30 every night):
#   30 2 * * * /path/to/repo/deploy/backup.sh /var/backups/neev-one
set -eu

DEST="${1:?usage: backup.sh /path/to/backup/dir}"
STAMP="$(date +%Y%m%d-%H%M%S)"
VOLUME="$(docker volume ls -q | grep -m1 'api-data$')"

mkdir -p "$DEST"

docker run --rm \
  -v "$VOLUME":/data:ro \
  -v "$DEST":/backup \
  alpine:3 sh -c "
    apk add --no-cache sqlite >/dev/null &&
    sqlite3 /data/dev.db \".backup /backup/neev-one-$STAMP.db\" &&
    gzip /backup/neev-one-$STAMP.db
  "

ls -1t "$DEST"/neev-one-*.db.gz | tail -n +31 | xargs -r rm --
echo "backup written: $DEST/neev-one-$STAMP.db.gz"
