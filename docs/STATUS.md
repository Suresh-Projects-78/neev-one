# Build Status

Updated 16 Aug 2026. Tracks what has actually shipped against
[ROADMAP.md](ROADMAP.md). Gap IDs refer to [REVIEW.md](REVIEW.md).

Branch: `phase-0-hardening` (baseline commit on `main`).

---

## Phase 0 — Stop the bleeding: **done**

| Item | Gap | Commit | Verified by |
|---|---|---|---|
| git init + baseline commit | B-7 | `5555c28` | 139 files tracked, no secrets staged |
| Hardened .gitignore, rotated JWT_SECRET | B-3 | `5555c28` | `git check-ignore .env` passes; secret was literally `change-me` |
| Removed hardcoded superuser email | C-1 | `174f854` | no `isOwnerUser` references remain; frontend builds |
| RBAC on all five invoice routes | C-2 | `ed850dd` | live server: VIEW+CREATE role gets 200/201, EDIT and DELETE get 403 |
| Global email uniqueness + org context on login | C-3, E-7 | `1f145bc` | duplicate email across accounts rejected on create *and* rename; login returns activeOrgId/activeBranchId |
| Server build emits runnable ESM | B-1 | `dd81852` | `npm run build && npm start` serves /health 200 |
| Deleted the dead Sequelize backend | D-4 | `8b962ce` | 3,281 lines removed across 37 files; both builds clean |
| Cross-platform npm scripts, PowerShell removed | B-2, B-5 | `30e9db8` | tasks.json valid; scripts run on macOS |

## Phase 1 — Server as system of record: **started**

| Item | Gap | Commit | Status |
|---|---|---|---|
| Double-entry ledger schema | A-3 | `a99a76f` | **done** — FiscalYear, Journal, LedgerAccount, JournalEntry, JournalLine |
| Control accounts by `controlKind`, not by name | A-3 | `a99a76f` | **done** — proven by a test that renames the AR account and keeps posting |
| Balanced-or-rejected posting, integer paise | A-3 | `a99a76f` | **done** |
| Posted entries immutable, corrections by contra entry | A-3, A-5 | `a99a76f` | **done** |
| Period lock | A-4 | `a99a76f` | **done** — posting into a locked period returns 409 |
| Hash chain over posted entries | A-5 | `a99a76f` | **done** |
| Invoice posts to the GL on create, reverses on delete | A-3 | `a99a76f` | **done** |
| Trial balance from posted lines | A-3 | `a99a76f` | **done** — `GET /api/orgs/:orgId/ledger/trial-balance` |
| Test suite | B-4 | `a99a76f` | **done** — vitest + supertest, 11 passing |
| Postgres + migration history | D-1 | — | not started |
| Remaining domain models (customer, vendor, item, bill, payment...) | D-2 | — | not started |
| Frontend reads from the API instead of localStorage | A-1, A-2 | — | **not started — this is the next and largest piece** |
| `sourceSystem`/`sourceKey` on every entity | migration | — | present on LedgerAccount only |

---

## How to verify locally

```bash
npm run setup && npm test
```

11 tests should pass. Then:

```bash
npm start
```

Web on 5173, API on 4001.

---

## Known blockers and caveats

- **Docker stack is still unverified, and it is an environment problem, not a
  code one.** Everything checkable without the daemon passes: `docker compose
  config` validates, every file the two images copy exists, and the exact
  command the API image runs — `node dist/index.js` — serves `/health` 200
  locally from the same compiled output. What cannot be done here is the build
  and run itself: Docker Desktop's processes are up and the CLI resolves its
  context, but the engine never answers, so `docker info` hangs on the Server
  section. Two attempts, hours apart.

  To finish it on a machine with a working daemon:

  ```bash
  cp .env.docker.example .env   # set JWT_SECRET
  npm run docker:up
  curl -f http://localhost:8080/          # the app
  curl -f http://localhost:8080/health    # the API through nginx
  ```
- **The frontend still writes the book to localStorage.** The ledger exists and
  invoices post to it, but every other voucher type is still client-only. Until
  the frontend migration lands, the GL is authoritative for invoices only.
- **SQLite still.** `invoices.ts` continues to use `$queryRawUnsafe` with
  SQLite `?` placeholders; Postgres needs `$1..$n` (gap D-1, C-9).
- **`requirePermission` still self-heals** for the org creator (gap C-4). Left
  in deliberately — removing it without a role-management UI would lock owners
  out of their own orgs. Phase 3.
- **Existing non-creator admins** need SALES/Invoices and ACCOUNTING/Ledger
  granted once via Settings → Roles.
- **node_modules had Windows binaries** (rollup, esbuild, bcrypt). Reinstalled
  for macOS; a Windows machine will need its own `npm install`.
