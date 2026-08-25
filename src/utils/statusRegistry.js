/**
 * Every status this product can put on a document, declared once.
 *
 * Before this there was no list to add a status to — you wrote a string. So
 * the same idea arrived in two spellings (`Approved` and `APPROVED`,
 * `Cancelled` and `CANCELLED`), and anything the pill's hardcoded ten-word
 * tone list did not recognise came out grey. Eleven of the twenty-one words in
 * use rendered as the same neutral grey, including `Unpaid` and `Approved`.
 *
 * The one that mattered most: `Draft` and `Unpaid` were identical on screen.
 * One is a document nobody has sent. The other is money somebody owes you. A
 * list exists to be scanned, and those two were indistinguishable at scanning
 * speed.
 *
 * Two rules hold this together:
 *
 * 1. A status not in this file is *visibly* unknown, not quietly grey. A new
 *    string added anywhere shows up as a fault, so it gets registered rather
 *    than silently joining the grey pile.
 *
 * 2. Tone says how to feel, never what the word is. `Cancelled` is neutral,
 *    not red: cancelling is usually a correction — wrong customer, wrong
 *    number — and painting a normal day's work as an emergency teaches people
 *    to ignore red. Red is kept for `Overdue` and `Rejected`, where something
 *    genuinely is wrong.
 */

/** tone → how the pill is coloured. Matches the --pos/--neg/--warn/--info tokens. */
export const STATUS_TONES = ['pos', 'neg', 'warn', 'info', 'neutral', 'outline'];

const REGISTRY = [
  // --- money owed to us, and money we owe -----------------------------------
  // Outline, not grey fill: a draft is the absence of a document, not a
  // state of the money. It has to be distinguishable from Unpaid at a glance —
  // that pair being identical was the defect this registry exists to fix.
  { key: 'draft', label: 'Draft', tone: 'outline', aliases: ['draft'] },
  { key: 'unpaid', label: 'Unpaid', tone: 'neutral', aliases: ['unpaid', 'open', 'issued'] },
  { key: 'partial', label: 'Partial', tone: 'warn', aliases: ['partial', 'partially paid'] },
  { key: 'overdue', label: 'Overdue', tone: 'neg', aliases: ['overdue', 'over due'] },
  { key: 'paid', label: 'Paid', tone: 'pos', aliases: ['paid', 'settled'] },
  // Deliberately neutral. See the note above.
  { key: 'cancelled', label: 'Cancelled', tone: 'neutral', aliases: ['cancelled', 'canceled', 'void'] },

  // --- approval ------------------------------------------------------------
  { key: 'pendingApproval', label: 'Pending approval', tone: 'warn', aliases: ['pending approval', 'pending', 'awaiting approval'] },
  { key: 'approved', label: 'Approved', tone: 'pos', aliases: ['approved'] },
  { key: 'rejected', label: 'Rejected', tone: 'neg', aliases: ['rejected', 'declined'] },

  // --- stock movement ------------------------------------------------------
  { key: 'inTransit', label: 'In transit', tone: 'warn', aliases: ['in transit', 'transferred out', 'transfer out'] },
  { key: 'received', label: 'Received', tone: 'pos', aliases: ['received', 'transfer in'] },
  { key: 'shortReceived', label: 'Short received', tone: 'warn', aliases: ['short received', 'short'] },

  // --- order / document lifecycle -----------------------------------------
  { key: 'closed', label: 'Closed', tone: 'pos', aliases: ['closed', 'completed', 'fulfilled'] },
  { key: 'posted', label: 'Posted', tone: 'pos', aliases: ['posted'] },
  { key: 'active', label: 'Active', tone: 'pos', aliases: ['active'] },
  { key: 'sent', label: 'Sent', tone: 'neutral', aliases: ['sent'] },
  { key: 'returned', label: 'Returned', tone: 'warn', aliases: ['returned'] },

  // --- external filings ----------------------------------------------------
  { key: 'registered', label: 'Registered', tone: 'pos', aliases: ['registered'] },
  { key: 'failed', label: 'Failed', tone: 'neg', aliases: ['failed', 'error'] },
];

/** Every alias, lowercased, pointing at its entry. Built once. */
const BY_ALIAS = new Map();
for (const entry of REGISTRY) {
  for (const a of entry.aliases) BY_ALIAS.set(a, entry);
  BY_ALIAS.set(entry.label.toLowerCase(), entry);
}

/**
 * Resolve any string the codebase produces to a canonical status.
 *
 * An unrecognised value comes back with `known: false` so the caller can show
 * it as a fault. Returning a grey pill instead is what let eleven statuses
 * drift into meaninglessness without anyone noticing.
 */
export const resolveStatus = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { key: 'none', label: '—', tone: 'neutral', known: true };
  const hit = BY_ALIAS.get(text.toLowerCase());
  if (hit) return { key: hit.key, label: hit.label, tone: hit.tone, known: true };
  return { key: 'unknown', label: text, tone: 'neutral', known: false };
};

/** For tests and for the design docs: the canonical list, in declaration order. */
export const allStatuses = () => REGISTRY.map((e) => ({ key: e.key, label: e.label, tone: e.tone }));

export default resolveStatus;
