import React, { useEffect, useRef } from 'react';

/**
 * Compact document header: number and dates on one tight line at the top of an
 * entry form.
 *
 * Operators coming from Tally expect the voucher number and date to be small,
 * always in the same place, and out of the way — the body of the document is
 * what they are actually typing. Focus lands on the first field that accepts
 * input so a new entry can be typed without touching the mouse.
 */
export const DocHeaderStrip = ({
  numberLabel = 'No.',
  number,
  onNumberChange,
  numberLocked = false,
  numberHint = '',
  numberError = '',
  dateError = '',
  date,
  onDateChange,
  dueDate,
  onDueDateChange,
  dueDateLabel = 'Due',
  extra = null,
  autoFocusTarget = 'auto',
}) => {
  const numberRef = useRef(null);
  const dateRef = useRef(null);

  useEffect(() => {
    if (autoFocusTarget === 'none') return;
    // A locked number cannot be typed into, so focus moves to the date.
    const target = numberLocked ? dateRef.current : numberRef.current;
    target?.focus();
    // Only on mount: re-focusing on every keystroke would fight the operator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="ui-panel px-3 py-2 flex flex-wrap items-end gap-x-4 gap-y-2"
      style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}
    >
      <div className="min-w-[9rem]">
        <label className="ui-label !mb-0.5 !text-[11px]" htmlFor="doc-number">
          {numberLabel}
        </label>
        <input
          id="doc-number"
          ref={numberRef}
          type="text"
          value={number ?? ''}
          onChange={(e) => onNumberChange?.(e.target.value)}
          disabled={numberLocked}
          required
          aria-invalid={numberError ? true : undefined}
          aria-describedby={numberError ? 'doc-number-error' : undefined}
          data-invalid={numberError ? 'true' : undefined}
          className="ui-input ui-mono !min-h-0 !py-1 !text-[13px] !w-36"
        />
        {numberError ? (
          <p id="doc-number-error" role="alert" className="ui-field-error">
            {numberError}
          </p>
        ) : null}
      </div>

      <div>
        <label className="ui-label !mb-0.5 !text-[11px]" htmlFor="doc-date">
          Date
        </label>
        <input
          id="doc-date"
          ref={dateRef}
          type="date"
          value={date ?? ''}
          onChange={(e) => onDateChange?.(e.target.value)}
          required
          aria-invalid={dateError ? true : undefined}
          data-invalid={dateError ? 'true' : undefined}
          className="ui-input !min-h-0 !py-1 !text-[13px] !w-40"
        />
        {dateError ? <p role="alert" className="ui-field-error">{dateError}</p> : null}
      </div>

      {onDueDateChange ? (
        <div>
          <label className="ui-label !mb-0.5 !text-[11px]" htmlFor="doc-due">
            {dueDateLabel}
          </label>
          <input
            id="doc-due"
            type="date"
            value={dueDate ?? ''}
            onChange={(e) => onDueDateChange(e.target.value)}
            className="ui-input !min-h-0 !py-1 !text-[13px] !w-40"
          />
        </div>
      ) : null}

      {extra}

      {numberHint ? <div className="ui-subtle text-[11px] pb-1 ml-auto">{numberHint}</div> : null}
    </div>
  );
};

export default DocHeaderStrip;
