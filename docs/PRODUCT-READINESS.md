# Getting to one finished product

Seven items, worst first. Each is its own commit, verified before the next
starts — the same way the six document forms were done.

| # | Item | Why it is on the list | State |
|---|---|---|---|
| 1 | Six masters reach the server | Clear the browser and they are gone | **done** |
| 2 | CSV formula injection | An export runs code on the accountant's machine | **done** |
| 3 | Audit trail can be read | Written in 7 places, readable in none | **done** |
| 4 | Bank reconciliation | The largest genuinely missing module | **next** |
| 5 | Record Receipt as a screen | Rows 49/52 of the original validation sheet | 5th |
| 6 | Per-user module assignment | Waiting on one decision | 6th |
| 7 | The deferred shells, built for real | Admin area, dashboard, billing, SSO, subdomains | 7th |

## 1 — Six masters that live only in the browser

`units` · `item categories` · `price lists` · `discount rules` · `cost centres` ·
`account groups`

Every other collection — invoices, bills, parties, items, challans, salesmen,
fixed assets — writes through to the server. These six never did. Clearing
browser data loses them, a second user never sees them, and a second device
starts empty.

Not cosmetic: a **price list decides what rate lands on an invoice**, and cost
centres are reported on. A book whose prices live in one person's browser is a
book nobody else can raise an invoice from.

## 2 — CSV formula injection

There is no guard on any export. A party named `=cmd|'/c calc'!A1` is a formula
when the file is opened in Excel, and the export is a file this product hands to
an accountant to open on their own machine. The fix is a prefix on any cell
starting with `= + - @`, tab or carriage return.

## 3 — The audit trail nobody can read

Seven server-side write sites, no read route, no screen. It also records only
UPDATE and DELETE — a row appearing out of nowhere is exactly what an auditor
asks about, and CREATE is not recorded.

## 4 — Bank reconciliation

Cash & Bank exists. GSTR-2B reconciliation exists. Reconciling a bank statement
against the book does not, and it is the first thing an accountant asks for.

## 5 — Record Receipt

Still a modal. The original validation sheet asked for a screen, and for the
list to navigate to the receipt rather than open a dialog over it.

## 6 — Per-user module assignment

One decision, still open: do roles carry modules, or do users? Roles is the
recommendation — a CA firm assigns "Intern" once rather than ticking modules per
person — but it is not mine to decide.

## 7 — The deferred shells, built properly

Billing, the account-level admin area, a multi-company dashboard, SSO and
subdomain routing were all deferred. Building the pages now against mock data,
and wiring the real thing later, is a good trade — but with two rules.

**Nothing may look wired when it is not.** Every unconnected page states it, in
the page, where a person demoing the product cannot miss it. A screen that looks
live and is not gets shown to a customer as if it were.

**SSO gets a settings page, never a working-looking login.** A sign-in button
that does not sign anyone in is security theatre, and it is the one place a
mock is genuinely unsafe.

Two of the five need no mock at all. The account, its companies and its users
are real and already on the server, so the admin area and the multi-company
dashboard can be built against live data from the first commit. Billing is the
one that needs invented numbers, because the plans do not exist yet — and the
pricing itself stays deferred, as asked.

## 1 — done

One `OrgMaster` table rather than six. These are small lists that are always
read whole — pricing an invoice reads an entire price list, never one row of it
— so what varies per kind lives in a JSON payload and the columns are only what
every kind shares: account, org, kind, name, active.

Write-through alone would have fixed half of it. The reason the browser was the
problem is that a second device started empty, so the six are hydrated on
sign-in through the same pull the documents already used, matched by server id
first and then by name so a list the browser already has never arrives twice.

Two comments in the codebase said cost centres, discount rules and price lists
could stay in the browser because "nothing reports on them". Both were wrong on
the facts and both are corrected: Cost Centers **is** a report — P&L by branch
or project — and a price list decides what rate lands on an invoice.

Isolation is tested three ways, because the first two passed while the third was
broken: across accounts, across two companies **inside one account** (the CA firm
case), and on the routes that change a row rather than only the one that lists
them. That last pair is the worse half — one company editing another's price
list changes what the other invoices at — and it took a surviving mutation to
notice the test was missing.

## 2 — done

Not one export but seven. Two shared utilities and five hand-rolled inside
feature screens: inventory, the trial balance drill-down, the TDS/TCS report,
GSTR-2B reconciliation, the sales overview and the cash-book upload template.
Fixing only the shared ones would have left six exports still running whatever
somebody typed into a name field.

Quoting was already there and is not the fix: `"=cmd|..."` becomes the cell
value `=cmd|...` the moment the spreadsheet strips the quotes.

The one nuance worth stating: **a number is left alone.** `-500` is a credit, not
an injection, and prefixing it would turn every negative figure in the book into
text that will not sum — a worse bug than the one being fixed. The guard applies
only where the value is not a number to begin with, which still catches `+91
98765 43210` and every formula payload.

A test walks the source and fails if any file that writes a CSV does not use the
guard, so the eighth export cannot quietly arrive without it.

## 3 — done

A read route, a screen under Users & Access, and the entry that was never
written: **CREATE**. The trail carried edits, status changes and deletions, so a
document appearing out of nowhere — the first thing an auditor asks about — had
no record at all.

Three things the screen does that a plain list would not:

- **The per-field diff is shown, not the word "edited".** `total 1,180 → 118` is
  an audit entry; "Invoice edited" is a row in a table.
- **Grouped by day, newest first, paged by cursor.** The trail only grows, and a
  count query over it would get slower every month.
- **`to` covers the whole closing day.** Filtering to today with a midnight
  bound returns nothing that happened today, which reads as a missing entry
  rather than a filter — the classic version of this bug.

**Read-only is the feature, not an omission.** There is no route that writes,
changes or deletes an entry, and a test asserts that POST, PATCH and DELETE all
404. A trail its own product can rewrite is evidence of nothing.

Isolation caught the same gap as item 1, in the same way: the cross-account test
passed while a query scoped by account alone leaked one company's trail to
another company in the same account. On an audit trail that is the worse leak —
it is a list of everything a client has ever changed, and the CA firm case puts
two clients side by side. The facets endpoint had it too.
