import { useCallback, useEffect, useRef } from 'react';

/**
 * The keyboard behaviour every document form shares.
 *
 * Invoice, sales order, bill, purchase order, credit note, debit note,
 * receipt, payment and journal are the same shape of screen and, until this
 * existed, had nine different answers to "what does Enter do here" — which for
 * most of them was "submit the half-typed document".
 *
 *   Ctrl+S            save (the draft, where the caller offers one)
 *   Ctrl+Enter        commit
 *   Ctrl+;            today's date, in a date field (Excel's)
 *   Enter             move to the next field; inside the line grid, open the
 *                     next line
 *   Tab               from the last cell of the last line, open the next line;
 *                     out of a date field, straight to the next field
 *   Ctrl+= / Ctrl++   add a line
 *   Ctrl+D            duplicate the line the cursor is in
 *   Ctrl+Delete       delete it
 *
 * Ctrl+Delete rather than the bare Delete the review sheet asks for: Delete
 * belongs to the text cursor, and a quantity cell where Delete removes the
 * whole line instead of a digit is a cell nobody can type in.
 *
 * The grid callbacks are all optional — a payment has no lines, and passing
 * nothing simply leaves those keys alone.
 *
 * @param formRef        ref to the <form>
 * @param onSave         Ctrl+S. Defaults to submitting.
 * @param onCommit       Ctrl+Enter. Defaults to submitting.
 * @param lineCount      how many lines the grid holds
 * @param addLine        open a new line
 * @param duplicateLine  (index) => void
 * @param removeLine     (index) => void
 * @param autoFocus      selector for the field to land on when the form opens
 * @param isDirty        () => boolean, for the unload guard
 */
/** Everything in a form the cursor can be put on, in the order it is read. */
const formFocusables = (form) =>
  Array.from(
    form.querySelectorAll(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    )
  ).filter((el) => el.offsetParent !== null);

export function useDocumentFormKeys({
  formRef,
  onSave = null,
  onCommit = null,
  lineCount = 0,
  addLine = null,
  duplicateLine = null,
  removeLine = null,
  autoFocus = '',
  isDirty = null,
}) {
  // Held in a ref so the listener below is registered once, not on every
  // keystroke that re-renders the form.
  const cfg = useRef({});
  useEffect(() => {
    cfg.current = { onSave, onCommit, lineCount, addLine, duplicateLine, removeLine, isDirty };
  });

  const submit = useCallback(() => formRef.current?.requestSubmit(), [formRef]);

  const onKeyDown = useCallback(
    (e) => {
      const c = cfg.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = String(e.key || '').toLowerCase();

      /*
       * A form does not own the keyboard while something is open on top of it.
       *
       * Dropdowns, dialogs and menus render through a portal, and a React
       * portal propagates its events up the *component* tree, not the DOM
       * tree — so a keystroke typed into a panel floating above this form
       * still arrives here. Without this guard, Tab on an open warehouse list
       * reached the line-grid handler and started a new item row, and Enter
       * walked focus through fields the person could not even see.
       *
       * Checked against the real DOM ancestry, which is what tells a portal
       * apart from a control genuinely inside the form.
       */
      const popup =
        e.target instanceof HTMLElement
          ? e.target.closest('[role="dialog"], [role="listbox"], [role="menu"]')
          : null;
      // ...but a form can *be* the dialog — several documents open in a modal.
      // Only a popup floating above this form disowns the keystroke; one that
      // contains the form is the form's own frame.
      if (popup && !popup.contains(formRef.current)) return;

      if (mod && key === 's') {
        e.preventDefault();
        (c.onSave || submit)();
        return;
      }
      /*
       * Ctrl+; — today, into whichever date field the cursor is in.
       *
       * Straight out of Excel, where it is muscle memory for anyone who keys
       * figures for a living, and there is nothing to weigh against it: the
       * combination means nothing else in a browser. An invoice date, a due
       * date and a receipt date are typed dozens of times a day and are almost
       * always today, which is the whole argument for it.
       *
       * The value has to go in through the element's own setter and an input
       * event, or React never hears about it and the next render puts the old
       * value straight back.
       */
      if (mod && e.key === ';') {
        const el = e.target;
        if (el instanceof HTMLInputElement && el.type === 'date' && !el.disabled && !el.readOnly) {
          e.preventDefault();
          const d = new Date();
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, iso);
          else el.value = iso;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }

      if (mod && e.key === 'Enter') {
        e.preventDefault();
        (c.onCommit || submit)();
        return;
      }

      const row = e.target instanceof HTMLElement ? e.target.closest('[data-line-row]') : null;

      if (mod) {
        if ((key === '=' || key === '+') && c.addLine) {
          e.preventDefault();
          c.addLine();
          return;
        }
        if (!row) return;
        const index = Number(row.dataset.lineRow);
        if (!Number.isFinite(index)) return;
        if (key === 'd' && c.duplicateLine) {
          e.preventDefault();
          c.duplicateLine(index);
          return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && c.removeLine) {
          e.preventDefault();
          // The last line is kept: a grid with no rows has nowhere to put the
          // cursor back.
          if (c.lineCount > 1) c.removeLine(index);
        }
        return;
      }

      /*
       * Tab leaves a date field in one press.
       *
       * A native date input is three little spinners — day, month, year — and
       * the browser makes Tab walk them before it will let go of the field, so
       * one Tab out of a date costs three. Nobody keying invoices wants that:
       * the browser already advances the segments for you as you type the
       * digits, so the only thing Tab is asked to do here is leave.
       *
       * Scoped to document forms on purpose. This is the browser's own
       * behaviour being overridden, and it is worth overriding exactly where
       * dates are typed all day.
       */
      if (e.key === 'Tab' && e.target instanceof HTMLInputElement && e.target.type === 'date') {
        const form = formRef.current;
        if (form) {
          const focusables = formFocusables(form);
          const at = focusables.indexOf(e.target);
          if (at !== -1) {
            const next = focusables[at + (e.shiftKey ? -1 : 1)];
            if (next) {
              e.preventDefault();
              next.focus();
              return;
            }
          }
        }
      }

      if (e.key === 'Tab' && !e.shiftKey && row && c.addLine) {
        /*
         * Tab out of the last control of the last line starts the next one,
         * the way a Tally operator expects.
         *
         * "Last control" means the last thing you type into. The row ends in a
         * delete button, and counting that meant Tab from the final rate did
         * nothing and a new line only opened from the bin icon — which is not
         * where anybody's hands are.
         */
        if (Number(row.dataset.lineRow) !== c.lineCount - 1) return;
        const entry = row.querySelectorAll(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
        );
        if (!entry.length || entry[entry.length - 1] !== e.target) return;
        e.preventDefault();
        c.addLine();
        return;
      }

      if (e.key !== 'Enter' || e.shiftKey || mod) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.tagName === 'TEXTAREA') return;

      if (row && c.addLine) {
        e.preventDefault();
        c.addLine();
        return;
      }

      /*
       * Enter anywhere else moves on rather than submitting.
       *
       * A form with one input submits on Enter and so does this one, which is
       * the classic way to book a half-typed document from the customer field.
       * Buttons keep their own behaviour, so Enter on Create still creates.
       */
      if (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button') return;
      const form = formRef.current;
      if (!form) return;
      const focusables = formFocusables(form);
      const at = focusables.indexOf(target);
      if (at === -1) return;
      e.preventDefault();
      focusables[at + 1]?.focus();
    },
    [formRef, submit]
  );

  /*
   * Land on the first meaningful field.
   *
   * preventScroll because a form can open already scrolled, and yanking the
   * page is worse than not focusing.
   */
  useEffect(() => {
    if (!autoFocus) return;
    const first = formRef.current?.querySelector(autoFocus);
    if (first instanceof HTMLElement) first.focus({ preventScroll: true });
    // Once, on open. Re-running would steal focus mid-typing.
  }, [autoFocus, formRef]);

  // The browser's own reload and close, which no in-app dialog can intercept.
  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e) => {
      if (!cfg.current.isDirty?.()) return;
      e.preventDefault();
      // Chrome shows its own wording and ignores the string; setting it is
      // still what arms the prompt in older engines.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  return onKeyDown;
}

export default useDocumentFormKeys;
