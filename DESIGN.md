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
Fonts are not yet installed. Add via self-host or Fontshare/Google before migration step 1.

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
| Money | Geist Mono | 13 / 18 | 500 | tabular-nums, right-aligned |
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

## Audit Baseline (2026-08-24)
Measured across `src/`. Migration is done when these reach zero.

| Finding | Count |
|---------|-------|
| `text-xs` / `text-sm` share of type usage | 1,857 / 2,019 |
| Copies of the same `<th>` class string | 346 |
| Hardcoded palette classes bypassing tokens | 319 |
| Competing radii (`lg` 323, `xl` 149, `full` 31, `md` 11) | 4 |
| Pages using `PageHeader` vs raw heading | 36 / 59 |

## Migration Order
1. Type ramp + spacing rhythm into `src/index.css`. Six `space-y` values to three, four radii to two.
2. Remove the 319 hardcoded palette classes. Fixes dark mode in those spots.
3. Extract `DataTable`; retire the 346 copied header strings.
4. Force `PageShell` on all 59 raw headings.
5. Monospace money everywhere an amount displays.
6. Unwrap list pages from their card — Sales, then Purchase, then the rest.
7. Build Payroll on the primitives with no new layout code. That build proves the system holds.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-24 | Shell + primitives rebuild over a discipline-only pass | The flat type scale is why it reads as a dense tool rather than premium SaaS; discipline alone would not fix it |
| 2026-08-24 | Monospace money | Digit-aligned columns; a wrong figure looks wrong. Stripe and Mercury do it, Indian accounting does not |
| 2026-08-24 | No card-in-card on lists | 2–3 more rows per screen, less framing noise. Departs from the Zoho/Tally convention deliberately |
| 2026-08-24 | Fraunces stays in-product for page titles | Serif-only-for-brand was considered and rejected; the serif is the differentiator |
| 2026-08-24 | Orange kept as the single accent | Already tokenized, and rare against Tally blue / Zoho red / QuickBooks green |
