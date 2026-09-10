# Company data export

A copy of one company's own books, for the people whose books they are.

**Settings → Account → Data Backup**, gated on `SETTINGS::Company data::EXPORT`.

## Why it is separate from the system backup

The system backup is the whole SQLite database: every customer's books in one
file. It belongs to whoever runs the service, and no customer should ever hold
one. It is also useless to a customer even if they had it — it cannot be read
without the server.

This is the other thing. One company, its own records, in a file the owner can
keep, open, read and take elsewhere. Beyond convenience it is two other things:
a customer who cannot get their data out is locked in, and under the DPDP Act a
data principal is entitled to their data in a portable form.

## What is in it

Branches, warehouses, customers and vendors with their addresses and contacts,
items, invoices, bills, quotations, sales and purchase orders, delivery challans,
credit and debit notes, expenses, receipts and payments with their allocations,
the chart of accounts, every journal entry and line behind them, salesmen, fixed
assets, the six reference lists, the cash and bank book, and recurring schedules.

Readable JSON with a header saying what it is, which company it came from, when
it was taken and how many of each record it holds — so a file found on a shared
drive in two years can explain itself.

## What is deliberately not in it

- **Any other company's data.** Every query is scoped to the account *and* the
  org. Tests assert that a second company's records — including a sibling
  company on the same account — never appear.
- **Credentials.** No users, passwords, sessions or API secrets. These are
  books, not a way in.

## What is not built, and why it says so on the page

**Sending it somewhere automatically.** A nightly copy to SharePoint, Google
Drive, a network share or object storage needs an account to send it to and
permission to write there. Neither exists, so nothing is scheduled and the page
says exactly that rather than implying a copy is going out.

**Restoring.** Reading a backup back in has to decide what happens to every
record that exists in both the file and the company — and a restore that
silently duplicates a year of invoices is worse than no restore at all. The page
says it is not offered rather than leaving a button that half works.

Until those exist, the honest description is: a record you can read, audit and
hand to an accountant, not a one-click undo.
