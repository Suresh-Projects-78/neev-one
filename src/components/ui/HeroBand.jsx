/**
 * The band every landing screen opens with.
 *
 * Home had it and the modules did not: Sales, Purchases and Inventory each
 * opened with a plain heading and a sentence, so moving from Home into a module
 * changed the shape and the ground colour of the top of the page for no reason
 * a reader could name. One component now, used by all of them — the title, the
 * one line under it, whatever governs the page on the right, and the ways in
 * along the bottom.
 *
 * What differs between screens is only what goes in it: Home greets you and
 * puts search on the right, a module names itself and puts its period picker
 * there. The shape, the spacing and the colour are not the caller's to choose.
 */
export default function HeroBand({ title, subtitle = null, right = null, meta = '', actions = [], children }) {
  return (
    <section className="pt-1" aria-label="Overview">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <h1
            className="ui-t-page"
            style={{ fontSize: '1.75rem', lineHeight: '2.125rem', letterSpacing: '-0.015em' }}
          >
            {title}
          </h1>

          {subtitle ? <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">{subtitle}</div> : null}
        </div>

        {right ? <div className="flex flex-col items-end gap-1.5">{right}</div> : null}
      </div>

      {/* Under whatever sits on the right — a date, a filing window, a count. */}
      {meta ? <div className="ui-caption mt-1.5 text-end">{meta}</div> : null}

      {actions?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              /* One primary, first. The rest are ways in, not invitations. */
              className={i === 0 ? 'ui-btn ui-btn-primary' : 'ui-btn ui-btn-secondary'}
            >
              {a.Icon ? <a.Icon size={15} aria-hidden="true" /> : null}
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

      {children}
    </section>
  );
}
