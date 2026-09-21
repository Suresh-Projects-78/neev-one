# Payroll — a separate application inside Neev

Payroll is its own bounded context. It has its own database, its own generated
Prisma client, its own migrations, and shares no table with accounting. It is
reached through the same shell, the same sign-in and the same permission model,
so to a user it is part of Neev; underneath, it is a second application.

## Why the boundary exists

**Blast radius.** Payroll holds what every person earns, their bank account and
their PAN. The strongest guarantee that none of it appears in a sales report is
not a code review — it is that the join which would leak it cannot be written.
A query against the accounting client cannot reach a salary, because the salary
is not in that database.

**Different lifecycle.** Payroll data is usually retained, exported, audited and
restored on a schedule of its own. One file means that can happen without
touching accounting, and without an accounting restore rolling back payroll.

**Room to move.** Payroll can be given its own server, or its own Postgres, by
changing one environment variable. No accounting query changes.

## What is NOT separate: the ledger

There is one set of books. Payroll does not keep a journal, a ledger account or
a trial balance of its own, and the payroll database contains no such table.
When a pay run is posted it calls the accounting posting service, exactly as
sales and purchases do, and the resulting journal lives in the accounting
database like every other entry.

`PayrollPosting` records **which** journal a run produced — the entry id, the
totals, who posted it and when. It is a receipt, not a second ledger.

## How the two are joined

Payroll stores Neev identifiers as plain strings, with no cross-database foreign
keys, because no such constraint can exist:

| Field | Points at |
| --- | --- |
| `accountId`, `orgId`, `branchId` | Neev tenancy |
| `ledgerAccountId` | `LedgerAccount` in accounting |
| `journalEntryId` | `JournalEntry` in accounting |
| `costCenterId` | `OrgMaster` of kind `COST_CENTER` |

Referential integrity across the boundary is the application's job, enforced at
the one place the two meet: posting. Inside payroll, foreign keys are real and
enforced as usual.

## The cost, stated plainly

**A transaction cannot span both databases.** Anything writing to both does it
in two steps, each idempotent, ordered so a crash in between leaves a state the
next attempt recognises and finishes.

For posting, the order is: write the journal in accounting, then record the
`PayrollPosting` in payroll. A crash between them leaves a journal with no
receipt. That is recoverable and visible — the run still reads as unposted, and
the next attempt finds the existing journal by its source document rather than
writing a second one. The reverse order would be worse: a receipt for a journal
that does not exist looks posted and is not.

`PayrollPosting` carries `@@unique([orgId, runId])`, so a run posts once however
many times the button is pressed.

## Files

| Path | What it is |
| --- | --- |
| `server/prisma/schema.prisma` | Accounting. No payroll model appears here. |
| `server/prisma/payroll/schema.prisma` | Payroll. 25 models. |
| `server/prisma/payroll/migrations/` | Payroll migration history. |
| `server/src/generated/payroll/` | Payroll client. Generated, not committed. |
| `server/src/utils/payrollPrisma.ts` | The payroll client, and `PayrollDb`. |
| `server/src/utils/prisma.ts` | The accounting client. Unchanged. |

## Operating it

`PAYROLL_DATABASE_URL` must be set wherever the API runs. `scripts/migrate.ts`
refuses to finish a deploy without it, rather than starting an API whose payroll
routes throw on first use.

```bash
npm run payroll:migrate    # develop against it
npm run payroll:deploy     # apply migrations
npm run prisma:generate    # generates BOTH clients
```

Both clients are generated in CI and on deploy. **A backup that copies only the
accounting database is not a backup of payroll** — take `payroll.db` with the
same `sqlite3 .backup` treatment as `prod.db`, never a plain `cp`.

## History

Payroll's tables were briefly created in the accounting schema
(`20260921060104_payroll_foundation`) and moved out in
`20260921062126_remove_payroll_from_accounting`. Both migrations are kept
because that is what happened; only local development ever applied the first.
