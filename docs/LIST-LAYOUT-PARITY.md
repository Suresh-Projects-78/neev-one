# The document list layout, applied to the sales siblings

_10 Sep 2026_

Sales Invoices sets what a list of documents looks like in this product. Its
five siblings had each grown their own screen, so moving between them meant
learning the page again.

## The layout, in order

1. **`PageHeader`** — title, one-line description, and on the right: search,
   any page-specific control, **More**, then one primary button.
2. **`StatCards`** — five figures, each answering a different question about
   the same book.
3. **Status tabs** — `ui-segmented` pills, each tinted with its own status
   colour, each carrying its count. `All` first, always selected on arrival.
4. **One card** holding the table: `ui-table ui-table-wide ui-table-sticky`,
   `ColumnHeader` per filterable column, `ui-rows` body, empty state inside the
   table rather than instead of it, totals bar at the foot.
5. **One tip** under the card, dismissed for good.

`src/components/list/DocumentListShell.jsx` carries 1, 2, 3 and the card. The
columns, the row and what a status means stay with each document — forcing a
challan through an invoice template is how a list ends up with a Balance column
that is always blank.

## What each page now says

| Page | Figures | Status tabs |
|---|---|---|
| Quotations | count · quoted · open · converted · expired | Draft · Sent · Accepted · Converted · Expired |
| Sales Orders | count · order value · to deliver · delivered-to-bill · billed | Open · Partly done · Delivered · Billed |
| Delivery Challans | count · goods out · out-not-billed · invoiced · job work | Out, not billed · Invoiced |
| Sales Returns | count · credited · against invoices · on account · draft | Draft · Issued · On account · Settled |
| Recurring | count · active · billing per month · due this month · paused | Active · Paused · Finished |

Receipts were already on this layout and were left alone.

## Derived, not stored

Three of the five filter on a status the row does not carry:

- a **quotation** expires when its validity date passes, whatever was typed;
- a **sales order** is Delivered or Billed according to the challans and
  invoices raised against it;
- a **credit note** on account is Settled once nothing is left to knock off.

A list that showed the stored word would say a lapsed quote is still Sent.

## Mistakes made

- The credit note tab said **Issued** and the row pill said **Unpaid** — the
  status registry aliases `issued` onto the Unpaid entry. The derived value is
  `Open` now, which is what the registry renders.
- The Sales Orders empty state read "Pick a customer, add lines…", which
  collided with the form's own **+ Add line** button — one test could no longer
  tell the two apart, and neither could a screen reader.
- Recurring's monthly figures normalise by frequency. Adding a yearly AMC to a
  monthly rent at face value says nothing.

`src/features/sales/listLayoutParity.test.jsx` holds all five to the contract:
heading, header search, five figures, tabs with counts, More, exactly one
primary, and no card inside a card.

## CRM — Customers, Vendors, Salesmen, Payment Reminders

Same shell, same order. Two of these carried a defect the layout work exposed:

**Customers and Vendors showed a balance nobody maintained.** Both listed a
stored `balance` field that nothing ever wrote to, so every row read ₹0.00
while the invoice list showed lakhs outstanding against the same names. What a
party owes is now computed from the documents — `src/utils/partyStanding.js`,
shared by both sides because the arithmetic is identical and writing it twice
is how two screens end up disagreeing about what "overdue" means. Cancelled and
draft documents are left out; the part past its due date is counted separately,
because that is the figure somebody rings about.

| Page | Figures | Tabs |
|---|---|---|
| Customers | count · owing you · outstanding · overdue · GST registered | Owing · Overdue · GST registered · Unregistered |
| Vendors | count · you owe · payable · overdue · GST registered | You owe · Overdue · GST registered · Unregistered |
| Salesmen | team · selling · invoices · sales (pre-GST) · commission due | Selling · No sales yet · Commission due |
| Payment Reminders | open invoices · outstanding · due now · 15+ days · to chase today | Send now · Due · 7+ days · 15+ days |

Payment Reminders has no primary action — it creates nothing, every invoice
with a balance appears on its own.

`CustomersList` and `VendorsList` moved out of `App.jsx` into
`src/features/crm/`. A screen that cannot be rendered on its own cannot be
tested on its own, and both were 350-line components inside a 14,000-line file.

### Mistakes made

- `isGstRegistered` first matched `/registered/i`, which is a substring of
  **Unregistered** — every unregistered party counted as registered.
- The Salesmen header's primary called `add()` with the form empty, so it only
  ever produced "name is required". It focuses the name field instead.
- The first version of the customer-balance test asserted `11,800` appeared in
  the row — which it did, from the *overdue* column, so replacing the computed
  figure with the old stored one still passed. The fixture now has one invoice
  due and one not, and the two columns are asserted separately.

`src/features/crm/crmLayoutParity.test.jsx` holds these four to the contract and
to the money.
