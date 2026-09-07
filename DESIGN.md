# Design System — Neev One

Preview (rendered): https://claude.ai/code/artifact/b5f06c26-a4de-4879-979f-fbb1e88ad45a

## Product Context
- **What this is:** GST accounting and business SaaS for Indian SMEs, expanding from Sales / Purchase / Inventory into Payroll, CRM, Attendance and Projects.
- **Who it's for:** CAs, accountants and SME finance teams who live in the software all day.
- **Space:** Tally, Zoho Books, Vyapar, QuickBooks India. All either dated or generic.
- **Project type:** dense data web application.
- **Memorable thing:** *Serious software for serious work.* Calm, obviously accurate, never shouts. Trust is the product.

## Aesthetic Direction
- **Direction:** Instrument — industrial-utilitarian, refined.
- **Decoration level:** minimal. Typography and spacing carry the page.
- **Mood:** a precision tool. Data is the interface; chrome gets out of the way.
- **Removed:** ambient orange orbs (`ui-ambient`) leave product screens. They stay on auth and marketing.

## Typography
Loaded from Google Fonts in `src/index.css` (2026-08-24). Inter remains the fallback so a cold cache never drops to system-ui.

- **Page titles:** Fraunces (variable serif, optical sizing) — already the brand voice. Keeping it in-product is what stops this looking like every other grotesque-only SaaS.
- **Body + UI:** Geist — built for interfaces, sharp at 13–14px, real tabular figures. Explicitly not Inter, not Space Grotesk: every AI design tool converges there.
- **Money:** Geist Mono, `font-variant-numeric: tabular-nums` — columns align to the digit.
- **Code:** Geist Mono.

### Scale (this is the fix — today 1,857 of 2,019 usages are 12–14px)
| Role | Font | Size / line | Weight | Notes |
|------|------|-------------|--------|-------|
| Page title | Fraunces | 24 / 32 | 600 | `letter-spacing: -.01em` |
| Section title | Geist | 16 / 24 | 600 | |
| Body, UI | Geist | 14 / 20 | 400–500 | |
| Table cell | Geist | 13 / 18 | 400 | |
| Money | Geist Mono | 13 / 18 | 400 | tabular-nums, right-aligned |
| Label, caption | Geist | 12 / 16 | 500 | `.04em`, uppercase |

Nothing below 12px. Nothing between 16 and 24.

## Color
- **Approach:** restrained. One accent, and it means one thing.
- **Brand `#F97316`:** primary action and active navigation. Nothing else. Rare in this category — Tally blue, Zoho red, QuickBooks green.
- **Money semantics, never the accent:** in `#15803D`, out / late `#B91C1C`, attention `#A16207`.
- **Column hues:** document number `#C2410C`, party name `#0F766E`. A row reads as fields, not prose.
- **Neutrals:** warm (stone), `#FAFAF9` → `#1C1917`, biased toward the orange so they read as chosen.
- **Dark mode:** redefine tokens only, never restyle components inside a theme block. Accent lifts to `#FB923C`; money greens and reds lighten for contrast on dark ground.

## Spacing
- **Base:** 8px.
- **Density:** comfortable-dense.
- **Rhythm — three values, not six:** 12 inside a group, 24 between groups, 40 between page sections.
- **Row height:** 36px table rows, 34px controls.

## Layout
- **Approach:** grid-disciplined.
- **Shell:** fixed 188px left rail with module groups, content pane on page ground.
- **Radius — two, not four:** 8px on anything clickable, 12px on anything holding content. `999px` for pills only.
- **No card-in-card.** A list is the page: one hairline, no wrapper. A document is a discrete object: it earns a surface.

## Motion
- **Approach:** minimal-functional.
- **Duration:** 120ms state, 200ms surface.
- **No entrance animation on list rows.** Data should be there when you look.
- Respect `prefers-reduced-motion`.

## Component Contract
Five primitives. A new module picks archetypes; it does not make layout decisions.

| Primitive | Owns | A module may change |
|-----------|------|---------------------|
| `PageShell` | Title, subtitle, one primary action, secondary actions, padding | The words and the action |
| `DataTable` | Header row, filter caret, density, hover, empty, skeleton, bulk bar, export | Columns and extractors |
| `DocumentView` | Sheet, party block, line table, totals rail, print / download / share | Document kind, line shape |
| `EntryForm` | Identity strip, party field, line grid, totals rail, footer actions | Fields and validation |
| `SettingsPanel` | Grouped toggles, descriptions, save behaviour | Which settings exist |

Rules that hold across every module:
1. One primary action per screen, top right.
2. Voucher number and date sit right of the page title on entry forms.
3. Print / Download / Share, in that order, above a document — never inside it.
4. Every amount is monospace and right-aligned.
5. Status is a pill; severity is carried by color *and* text, never color alone.
6. A status hue is a **background**, never type. Pills and filter tabs keep grey
   text on a pale tint; the word carries the meaning and the tint places it.
7. Detail panels state a value in grey at normal weight. A view page is read,
   not scanned for exceptions, so nothing in it is emphasised over anything
   else.

## Audit Baseline (2026-08-24)
Measured across `src/`. Migration is done when these reach zero.

| Finding | Count |
|---------|-------|
| `text-xs` / `text-sm` share of type usage | 1,857 / 2,019 |
| Copies of the same `<th>` class string | 346 |
| Hardcoded palette classes in app chrome | 9 → 0 (fixed 2026-08-24) |
| Hardcoded palette classes in print documents | 298 — correct, see note |
| Competing radii (`lg` 323, `xl` 149, `full` 31, `md` 11) | 4 |
| Pages using `PageHeader` vs raw heading | 36 / 59 |

**Note on the 298.** The first audit counted 319 raw palette classes and called
them debt. That was wrong. 298 of them live in `InvoicePreview.jsx`, the invoice
template renderer in `App.jsx`, and `ExpenseVoucher.jsx` — printed documents,
which are black on white in both themes because that is what comes out of a
printer. Only 9 were real, in app chrome, and those are now tokens. Print
surfaces are deliberately exempt from the token rule.

## Screen Contract

What "done" means for a screen, derived from the Sales Invoice rebuild. Every screen
gets checked against this list; a screen that fails any line is not finished.

**Both archetypes**
1. **Shell.** A list or report uses `PageHeader`. A document uses `DocFormActions` —
   title left; Back, secondary, primary and the ⋮ menu right, pinned while scrolling.
2. **A way back.** Any screen reached *from* another screen carries a Back control that
   returns to where it was opened from, not to a fixed home.
3. **One primary action**, top right. Everything else is secondary or lives in ⋮.
4. **Tokens only.** No `bg-*`/`text-*`/`border-*` palette literals in app chrome; print
   surfaces are the documented exception. Contrast is measured with alpha composited,
   never eyeballed.
5. **Fields carry no local sizing.** `.ui-input` / `.ui-select` own their padding and
   height. A `px-3 py-2` beside them is a silent override and reads as a different
   size to the rest of the product.

**Documents additionally**
6. **Head in two columns**, ruled apart: who and where on the left, the paperwork —
   number, dates, references — on the right.
7. **Line grid** at `.ui-grid-dense`: 36px rows, 34px controls, column widths sized to
   what the column holds, figures mono and right-aligned, no spin buttons.
8. **Keyboard.** Pickers on the shared `useListboxKeys` contract; the form on
   `useDocumentFormKeys`. Arrows move between fields and down a grid column, Tab commits
   and advances, a date field is left in one press, Alt+C creates a master in place,
   Ctrl+; enters today.
9. **One figure per job** at the foot. The same total printed three times makes a reader
   check whether the three agree.

Keyboard behaviour is covered by tests in `src/**/*.test.jsx` and runs in the CI gate,
because focus, portals and event order cannot be read off the source.

## Migration Order
1. Type ramp + spacing rhythm into `src/index.css`. Six `space-y` values to three, four radii to two.
2. ~~Remove the hardcoded palette classes.~~ Done (verified 2026-09-07) — the 9 in app
   chrome are tokens; the 329 remaining are all print surfaces and stay as they are.
3. Extract `DataTable`; retire the 346 copied header strings.
4. Force `PageShell` on all 59 raw headings.
5. Monospace money everywhere an amount displays.
6. Unwrap list pages from their card — Sales, then Purchase, then the rest.
7. Build Payroll on the primitives with no new layout code. That build proves the system holds.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-24 | Shell + primitives rebuild over a discipline-only pass | The flat type scale is why it reads as a dense tool rather than premium SaaS; discipline alone would not fix it |
| 2026-09-08 | Money drops to weight 400 | Monospace and right alignment already mark a figure as money. A weight on top made every amount in every table an emphasis, and a screen that is mostly amounts then had none |
| 2026-09-08 | Status hues move out of type and into the tint | Seven saturated words in the filter strip competed with each other and with the figures beside them. Reverses the 2026-09-01 contrast increase, which raised the wrong thing |
| 2026-08-24 | Monospace money | Digit-aligned columns; a wrong figure looks wrong. Stripe and Mercury do it, Indian accounting does not |
| 2026-08-24 | No card-in-card on lists | 2–3 more rows per screen, less framing noise. Departs from the Zoho/Tally convention deliberately |
| 2026-08-24 | Fraunces stays in-product for page titles | Serif-only-for-brand was considered and rejected; the serif is the differentiator |
| 2026-08-24 | Orange kept as the single accent | Already tokenized, and rare against Tally blue / Zoho red / QuickBooks green |
| 2026-09-07 | Field sizing lives in the token, not at the call site | 390 call sites restated `.ui-input`'s own padding and beat it. Heights were unaffected — `min-height` already governed — but the horizontal metric differed from the rest of the product |
| 2026-09-07 | Selection is the accent's job | Six list screens marked the chosen row with `bg-stone-100`, a light-palette literal, so a selected row in dark mode was a near-white band across a dark table |
| 2026-09-07 | The Screen Contract above is the definition of done | The invoice rebuild produced the same nine findings screen after screen; written down, they are reviewable instead of rediscovered |
| 2026-08-24 | Print surfaces exempt from the token rule | A printed invoice is black on white whatever theme the app is in. The audit's 319-colour finding was 93% print documents and only 9 real violations |
