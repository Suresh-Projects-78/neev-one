#!/usr/bin/env bash
# A backup of the live books, and a restore that has been proved to work.
#
# The previous version of this file backed up a Docker volume. Production does
# not run Docker — it runs the API under systemd with SQLite at
# /opt/neev/data/prod.db — so the script had never taken a single backup, and
# the box was found with no archive of any kind on it.
#
#   ./backup.sh                     # back up, using the paths below
#   ./backup.sh --verify            # back up, then prove the archive restores
#   ./backup.sh --restore FILE DEST # restore an archive to a path
#
# Install (on the server, once):
#   sudo cp deploy/backup.sh /usr/local/bin/neev-backup
#   sudo chmod +x /usr/local/bin/neev-backup
#   ( crontab -l 2>/dev/null; echo "30 2 * * * /usr/local/bin/neev-backup --verify >> /var/log/neev-backup.log 2>&1" ) | crontab -
set -euo pipefail

DB="${NEEV_DB:-/opt/neev/data/prod.db}"
DEST="${NEEV_BACKUP_DIR:-/var/backups/neev-one}"
KEEP="${NEEV_BACKUP_KEEP:-30}"

die() { echo "backup: $*" >&2; exit 1; }

# ---------------------------------------------------------------- restore
if [ "${1:-}" = "--restore" ]; then
  ARCHIVE="${2:?usage: backup.sh --restore ARCHIVE DEST}"
  TARGET="${3:?usage: backup.sh --restore ARCHIVE DEST}"
  [ -f "$ARCHIVE" ] || die "no such archive: $ARCHIVE"
  # Never restore over a live database by accident: the caller names the target
  # and it must not already exist.
  [ -e "$TARGET" ] && die "refusing to overwrite $TARGET — move it aside first"
  gunzip -c "$ARCHIVE" > "$TARGET" || die "archive will not decompress: $ARCHIVE"

  # Acted on, not printed. A restore that reports "ok" on a corrupt file and
  # carries on is the exact failure this whole script exists to prevent.
  # `|| true` so a malformed database does not abort under `set -e` before the
  # check below can report it and clean the useless file away.
  INTEGRITY="$(sqlite3 "$TARGET" 'PRAGMA integrity_check;' 2>&1 | head -1 || true)"
  if [ "$INTEGRITY" != "ok" ]; then
    rm -f "$TARGET"
    die "restored file is not a usable database: $INTEGRITY"
  fi
  echo "restored: $ARCHIVE -> $TARGET (integrity ok)"
  exit 0
fi

# ----------------------------------------------------------------- backup
command -v sqlite3 >/dev/null || die "sqlite3 is not installed (apt-get install -y sqlite3)"
[ -f "$DB" ] || die "no database at $DB (set NEEV_DB)"

mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$DEST/neev-one-$STAMP.db"

# sqlite3's own .backup, not cp: a plain copy taken mid-write is a corrupt file
# that looks fine until the day you need it.
#
# The exit status is checked explicitly. A locked database makes sqlite3 write
# an empty file, and this script once reported success on one - an archive that
# exists, compresses, decompresses, and contains nothing.
if ! sqlite3 "$DB" ".backup '$ARCHIVE'"; then
  rm -f "$ARCHIVE"
  die "sqlite3 could not back up $DB (locked, or unreadable)"
fi
gzip "$ARCHIVE"
ARCHIVE="$ARCHIVE.gz"

# ---------------------------------------------------------------- verify
#
# The part that makes this a backup rather than a hope. An archive nobody has
# restored is a file of unknown value, and the moment you find out is the moment
# you can least afford to.
if [ "${1:-}" = "--verify" ]; then
  PROBE="$(mktemp -d)"
  trap 'rm -rf "$PROBE"' EXIT
  gunzip -c "$ARCHIVE" > "$PROBE/probe.db"

  INTEGRITY="$(sqlite3 "$PROBE/probe.db" 'PRAGMA integrity_check;' 2>&1 | head -1 || true)"
  [ "$INTEGRITY" = "ok" ] || die "restored copy failed integrity check: $INTEGRITY"

  # Present and readable is not the same as complete.
  #
  # Every table here is COMPARED against the live database, not merely listed.
  # An earlier version listed four and compared two - and the two it compared
  # happened to be empty on both sides, so an entirely empty archive passed
  # while the source held forty-nine accounts. What is only printed is
  # decoration; the comparison is the test.
  total=0
  for table in Account Org User Invoice Party JournalEntry; do
    live="$(sqlite3 "$DB" "SELECT COUNT(*) FROM \"$table\";" 2>/dev/null || echo missing)"
    restored="$(sqlite3 "$PROBE/probe.db" "SELECT COUNT(*) FROM \"$table\";" 2>/dev/null || echo missing)"
    [ "$live" = "missing" ] && die "live database has no $table table"
    [ "$restored" = "missing" ] && die "restored copy has no $table table"
    [ "$live" = "$restored" ] || die "$table: live has $live rows, the restore has $restored"
    total=$((total + live))
    echo "  $table: $restored rows"
  done

  # Every table empty is what a silently-failed backup looks like.
  [ "$total" -gt 0 ] || die "every table is empty - this is not a backup of a live database"

  echo "verified: $ARCHIVE restores, passes integrity, and matches the live row counts"
fi

ls -1t "$DEST"/neev-one-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --
echo "backup written: $ARCHIVE"
