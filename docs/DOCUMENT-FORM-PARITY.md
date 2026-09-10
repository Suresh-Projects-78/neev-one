# Document form parity — tracker

The same document is entered six ways and only one of them got the work. Every
keyboard fix, the dense line grid, custom fields and the preview went into the
invoice form; its siblings were left where they were. Somebody entering a sales
order gets none of it.

Measured 2026-09-10. Fixed one form at a time, worst first, each its own commit.

| Form | Grid | Keyboard | Custom fields | Preview | State |
|---|---|---|---|---|---|
| Invoice | yes | yes | yes | yes | reference |
| Sales Order | — | — | — | — | **1st** |
| Delivery Challan | — | — | — | — | **2nd** |
| Debit Note | — | yes | — | — | **3rd** |
| Purchase Order | — | yes | — | yes | **4th** |
| Estimate | yes | yes | — | yes | **5th** |
| Credit Note | yes | yes | — | yes | **6th** |

## What each column means

**Grid** — the dense line-item grid (`ui-grid-dense`): 36px rows, columns sized
to their content, money right-aligned and monospace. Without it a form uses
whatever layout it was born with, and the columns do not line up with the
invoice a user just left.

**Keyboard** — `useDocumentFormKeys`. Tab in visual order, arrow keys inside a
picker, Enter to choose, Ctrl/Cmd+S to save, and the portal guard that stops a
keystroke typed into a dropdown reaching the line grid underneath. This is the
one that took four rounds to get right on the invoice, and none of that reached
the others.

**Custom fields** — fields a company invents. Built once, wired only to
invoices, so a business that added "PO reference" cannot put it on a sales order.

**Preview** — the printed document. A challan needs one most of all: it travels
with the goods.

## Order, and why

Sales Order and Delivery Challan first because they have NO keyboard handling at
all — the fixes from this session are simply absent, so they are the two forms
where daily entry is worst. Then the two missing the grid, then the two that
only lack custom fields.

## Not doing

Rebuilding the six into one config-driven form. It is the better end state and
it is not what "one by one" asks for; each form is brought up to the reference
on its own so nothing else moves while it happens. If the shared shell is wanted
later, six forms that already agree are a much easier starting point than six
that do not.
