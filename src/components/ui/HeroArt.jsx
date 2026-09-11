/**
 * The drawing at the right-hand end of the Home band.
 *
 * A blank first hour is the day somebody decides what they think of the
 * product, and until now that hour was a heading and a checklist on an empty
 * white page. This is the one piece of warmth on the screen: a document being
 * written, the figures it turns into, and something growing next to them.
 *
 * Drawn rather than dropped in as an image, for three reasons: it takes the
 * theme's own tokens so it is not a peach rectangle floating on a dark page,
 * it costs no request, and it stays sharp at any width. Decorative, so it is
 * hidden from assistive technology — nothing here is said only in the picture.
 */
export default function HeroArt({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 420 210"
      fill="none"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {/* The wash the whole thing sits on — one soft shape, not a row of
          bubbles. */}
      <path
        d="M92 24c48-26 118-24 176-8 52 14 96 40 106 76 9 33-16 70-62 88-52 20-128 26-190 10C64 175 22 147 18 112 14 74 44 50 92 24Z"
        fill="rgb(var(--brand) / 0.16)"
      />

      {/* The document. A thing being written, with one line already in the
          brand's own colour so the eye lands on it. */}
      <g>
        <rect x="196" y="36" width="118" height="140" rx="10" fill="rgb(var(--surface))" />
        <rect x="196" y="36" width="118" height="140" rx="10" stroke="rgb(var(--brand) / 0.22)" strokeWidth="1.5" />
        <rect x="214" y="58" width="60" height="9" rx="4.5" fill="rgb(var(--brand) / 0.55)" />
        <rect x="214" y="80" width="82" height="7" rx="3.5" fill="rgb(var(--border-strong) / 0.55)" />
        <rect x="214" y="96" width="70" height="7" rx="3.5" fill="rgb(var(--border-strong) / 0.4)" />
        <rect x="214" y="112" width="82" height="7" rx="3.5" fill="rgb(var(--border-strong) / 0.4)" />

        {/* What the document becomes: three figures, rising. */}
        <rect x="214" y="150" width="14" height="14" rx="3" fill="rgb(var(--brand) / 0.35)" />
        <rect x="236" y="138" width="14" height="26" rx="3" fill="rgb(var(--brand) / 0.6)" />
        <rect x="258" y="126" width="14" height="38" rx="3" fill="rgb(var(--brand))" />
      </g>

      {/* Something growing beside it. The one green on the page, and the only
          thing here that is not paperwork. */}
      <g>
        <path d="M352 128c-14-10-20-28-14-44 16 4 27 18 27 35" fill="rgb(var(--ov-green) / 0.55)" />
        <path d="M362 132c10-12 12-30 4-44-14 8-21 24-18 40" fill="rgb(var(--ov-green) / 0.75)" />
        <path d="M357 132v34" stroke="rgb(var(--ov-green))" strokeWidth="2.5" strokeLinecap="round" />
        <path
          d="M338 164h38l-5 22a6 6 0 0 1-6 5h-16a6 6 0 0 1-6-5l-5-22Z"
          fill="rgb(var(--brand) / 0.3)"
          stroke="rgb(var(--brand) / 0.5)"
          strokeWidth="1.5"
        />
      </g>

      {/* Three words in a hand, and an arrow to where the work happens. */}
      <g fill="rgb(var(--brand-ink))" style={{ fontFamily: "'Segoe Script', 'Bradley Hand', 'Snell Roundhand', cursive" }}>
        <text x="96" y="74" fontSize="21">Track</text>
        <text x="96" y="108" fontSize="21">Manage</text>
        <text x="96" y="142" fontSize="21">Grow</text>
      </g>
      <path
        d="M176 128c14 2 22 10 24 22"
        stroke="rgb(var(--brand))"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M194 146l6 5 2-8"
        stroke="rgb(var(--brand))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
