# Backup and restore

## What was found

On 10 September 2026 the production box had **no backups of any kind**:

- the live database is `/opt/neev/data/prod.db`,
- there were no archives anywhere on the host,
- there was no cron entry, for the deploy user or for root,
- and `deploy/backup.sh` backed up a **Docker volume** — production runs the API
  under systemd, so that script had never taken a single backup here.

The September audit recorded this as "backup exists; recovery evidence does
not". It was worse than that: the backup did not exist either. One accidental
`rm`, one disk failure, and the books were gone.

## What it does now

`deploy/backup.sh` matches how production actually runs.

```
./backup.sh                      # take a backup
./backup.sh --verify             # take one, then prove it restores
./backup.sh --restore FILE DEST  # restore an archive
```

It uses SQLite's own `.backup`, not `cp`: a plain copy taken mid-write is a
corrupt file that looks fine until the day you need it.

**`--verify` is the part that makes it a backup rather than a hope.** It
decompresses the archive, runs an integrity check, and compares the row counts
of six tables against the live database. Anything it only *printed* would be
decoration — the comparison is the test.

That distinction is not theoretical. The first version of this script listed
four tables and compared two, and the two it compared happened to be empty on
both sides — so an entirely empty archive passed while the source held
forty-nine accounts. It had been produced by a `sqlite3 .backup` that failed on
a locked database and returned quietly. Both holes are closed: the exit status
is checked, and every table listed is compared.

## Proved, not assumed

All five paths were exercised:

| Case | Result |
|---|---|
| Good database, verify | passes |
| Empty database (a silently-failed backup) | refused |
| Missing database | refused |
| Corrupt archive restored | refused, and the useless file removed |
| Real round trip | restored, row counts match |

The corrupt case matters most: `--restore` used to *print* the integrity result
and carry on. A restore that says "ok" over a malformed database is the exact
failure the whole exercise exists to prevent, so it now refuses and cleans up.

## Installing it

Not done from here — it changes the server. On the box:

```bash
sudo cp deploy/backup.sh /usr/local/bin/neev-backup
sudo chmod +x /usr/local/bin/neev-backup
sudo apt-get install -y sqlite3            # if it is not already there
sudo /usr/local/bin/neev-backup --verify   # prove it works before trusting it
( crontab -l 2>/dev/null; echo "30 2 * * * /usr/local/bin/neev-backup --verify >> /var/log/neev-backup.log 2>&1" ) | crontab -
```

## Still missing, and it matters

**The archives stay on the same machine as the database.** That protects against
a mistake; it does not protect against losing the host. An encrypted copy to
somewhere else — object storage, another machine — is the remaining half, and it
needs credentials and a destination that are yours to choose.

Until that exists, the honest description is: recoverable from a bad deploy or a
dropped table, not from losing the server.
