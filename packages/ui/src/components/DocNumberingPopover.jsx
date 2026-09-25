import { useState } from 'react';

import Popover from './ui/Popover';

/**
 * The series a document is numbered from, changed on the document itself.
 *
 * Changing a series is a different act from raising the document, but it is
 * nearly always realised *while* raising one — the number that comes up is
 * wrong, or the year has turned over. So it opens over the form rather than
 * navigating away from half-typed work, and the full settings screen is one
 * click further on for anything this panel does not cover.
 *
 * It was written for invoices and lived inside the sales form. Bills are
 * numbered by the same rules, off the same `docSettings.numbering` shape, and
 * were given no way to say so: the bill number was whatever the series had
 * already decided. One panel, told which voucher it is editing.
 */
const DocNumberingPopover = ({
  anchorRef,
  db,
  setDb,
  currentCompany,
  /* Which series: the key under `docSettings.numbering`, e.g. invoice, bill. */
  voucherKey = 'invoice',
  /* The branch this document belongs to, or '' for the company-wide series. */
  branchId,
  settings,
  title = 'Numbering',
  /* What the sample line says — "Next invoice will be", "Next bill will be". */
  sampleLabel = 'Next number will be',
  manualLabel = 'Typed on each document',
  onClose,
  onOpenFullSettings,
}) => {
  const current = settings && typeof settings === 'object' ? settings : {};
  const [draft, setDraft] = useState(() => ({
    mode: String(current.mode || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto',
    prefix: String(current.prefix ?? ''),
    suffix: String(current.suffix ?? ''),
    nextNumber: Number(current.nextNumber ?? 1) || 1,
    allowManualOverride: current.allowManualOverride !== false,
  }));

  const set = (patch) => setDraft((p) => ({ ...p, ...patch }));
  /* Several of these can sit on one screen; the ids have to differ. */
  const id = (part) => `${voucherKey}-num-${part}`;

  const save = () => {
    const scoped = String(branchId || '').trim();
    setDb({
      ...db,
      companies: (db.companies || []).map((c) => {
        if (c.id !== currentCompany.id) return c;
        const baseDoc = c?.docSettings && typeof c.docSettings === 'object' ? c.docSettings : {};
        const patch = {
          mode: draft.mode,
          prefix: draft.prefix,
          suffix: draft.suffix,
          nextNumber: Math.max(1, Number(draft.nextNumber) || 1),
          allowManualOverride: Boolean(draft.allowManualOverride),
        };
        /* A branch numbers its own documents; without one this is the
           company-wide series. Either way only this voucher's entry moves. */
        if (scoped) {
          const prevByBranch =
            baseDoc?.numberingByBranch && typeof baseDoc.numberingByBranch === 'object' ? baseDoc.numberingByBranch : {};
          const prevBranch =
            prevByBranch?.[scoped] && typeof prevByBranch[scoped] === 'object' ? prevByBranch[scoped] : {};
          return {
            ...c,
            docSettings: {
              ...baseDoc,
              numberingByBranch: {
                ...prevByBranch,
                [scoped]: { ...prevBranch, [voucherKey]: { ...(prevBranch[voucherKey] || {}), ...patch } },
              },
            },
          };
        }
        const prevNum = baseDoc?.numbering && typeof baseDoc.numbering === 'object' ? baseDoc.numbering : {};
        return {
          ...c,
          docSettings: {
            ...baseDoc,
            numbering: { ...prevNum, [voucherKey]: { ...(prevNum[voucherKey] || {}), ...patch } },
          },
        };
      }),
    });
    onClose?.();
  };

  const sample = `${draft.prefix}${String(Math.max(1, Number(draft.nextNumber) || 1))}${draft.suffix}`;

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} minWidth={310}>
      <div className="p-3 space-y-3">
        <div className="ui-t-label">{title}</div>

        <div>
          <label className="ui-label" htmlFor={id('mode')}>How numbers are issued</label>
          <select
            id={id('mode')}
            className="ui-select"
            value={draft.mode}
            onChange={(e) => set({ mode: e.target.value })}
          >
            <option value="auto">Automatic from the series</option>
            <option value="manual">{manualLabel}</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="ui-label" htmlFor={id('prefix')}>Prefix</label>
            <input
              id={id('prefix')}
              className="ui-input ui-mono"
              value={draft.prefix}
              onChange={(e) => set({ prefix: e.target.value })}
            />
          </div>
          <div>
            <label className="ui-label" htmlFor={id('suffix')}>Suffix</label>
            <input
              id={id('suffix')}
              className="ui-input ui-mono"
              value={draft.suffix}
              onChange={(e) => set({ suffix: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="ui-label" htmlFor={id('next')}>Next number</label>
          <input
            id={id('next')}
            type="number"
            min="1"
            className="ui-input ui-mono"
            value={draft.nextNumber}
            onChange={(e) => set({ nextNumber: e.target.value })}
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="ui-checkbox"
            checked={draft.allowManualOverride}
            onChange={(e) => set({ allowManualOverride: e.target.checked })}
          />
          Allow typing over the number
        </label>

        <div className="rounded-lg px-3 py-2" style={{ background: 'rgb(var(--surface-sunken))' }}>
          <div className="ui-caption">{sampleLabel}</div>
          <div className="ui-mono text-sm font-medium">{sample}</div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {typeof onOpenFullSettings === 'function' ? (
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onOpenFullSettings}>
              All numbering
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="flex items-center gap-2">
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={save}>
              Save
            </button>
          </div>
        </div>
      </div>
    </Popover>
  );
};

export default DocNumberingPopover;
