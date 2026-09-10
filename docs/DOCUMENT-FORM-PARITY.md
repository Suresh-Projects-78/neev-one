# Document form parity — tracker

The same document is entered six ways and only one of them got the work. Every
keyboard fix, the dense line grid, custom fields and the preview went into the
invoice form; its siblings were left where they were. Somebody entering a sales
order gets none of it.

Measured 2026-09-10. Fixed one form at a time, worst first, each its own commit.

| Form | Grid | Keyboard | Custom fields | Print | State |
|---|---|---|---|---|---|
| Invoice | yes | yes | yes | yes | reference |
| Sales Order | yes | yes | yes | yes | **done** |
| Delivery Challan | yes | yes | yes | yes | **done** |
| Debit Note | — | yes | — | — | **next** |
| Purchase Order | — | yes | — | — | 4th |
| Estimate | yes | yes | — | — | 5th |
| Credit Note | yes | yes | — | — | 6th |

A first pass read four of these as having a preview. They do not. The grep
matched `originalPreviewOpen` and `BillPreview` — a credit note showing the
invoice it reverses, a purchase order showing the bill it came from. Neither
prints the document being edited. Corrected before any work started: only the
invoice (and the bill) can be put on paper at all, so an estimate cannot be
sent to a customer and a challan cannot travel with the goods.

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

**Print** — the document on paper. Only invoices and bills have one. A challan
needs it most: it rides with the lorry and the driver hands it over. An
estimate is worthless unless the customer can be sent it. This is the column
that is not polish — it is the document failing to do its job.

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

## What the first two cost, and what came out of it

Three things were pulled out of the invoice rather than copied:

- `DocumentCustomFields` — the fields a company invents, and `getCustomFields`
  now takes a document type and falls back to the invoice's list, so one
  definition serves every sales document.
- `PrintDownloadFrame` — Print and Download. Nothing in it was ever
  invoice-specific; it only lived there.
- `DocumentPrintView` — new. One honest layout for every document that is not
  an invoice. Columns earn their place from the lines, so a challan does not
  print five empty tax columns.

That is why the first form took the longest. The four that follow reuse all
three.

`amountInWordsInr` moved from `InvoicePreview` to `utils/money`, so a print view
no longer drags the QR code library in behind it.

The design tests caught the new print surface on their first run and were right
to: `DocumentPrintView` is black on white and uses raw palette classes. It is
now exempt alongside `InvoicePreview` and `ExpenseVoucher`, which is the
exemption DESIGN.md already grants printed documents.
