import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

import { subscribeConfirms, subscribeToasts } from './notify';

/**
 * The one place notifications become pixels: a toast stack bottom-right and
 * a styled confirm dialog. Mounted once at the app root.
 *
 * Toasts: role="status" polite live region, auto-dismiss (errors linger
 * longer because they carry instructions), manual dismiss always available.
 * Newest at the bottom, nearest the corner they appear from.
 *
 * Confirm: replaces window.confirm. Escape cancels, the danger action is a
 * real ui-btn-danger, and focus starts on Cancel so a stray Enter cannot
 * delete anything.
 */

const TONE = {
  success: { icon: CheckCircle2, color: 'var(--pos)' },
  error: { icon: AlertCircle, color: 'var(--neg)' },
  info: { icon: Info, color: 'var(--info)' },
};

export default function Toaster() {
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const offToasts = subscribeToasts((t) => {
      setToasts((prev) => [...prev.slice(-4), t]); // cap the stack at 5
      const ttl = t.kind === 'error' ? 7000 : 4000;
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), ttl);
    });
    const offConfirms = subscribeConfirms((req) => setConfirm(req));
    return () => {
      offToasts();
      offConfirms();
    };
  }, []);

  useEffect(() => {
    if (!confirm) return undefined;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        confirm.resolve(false);
        setConfirm(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirm]);

  const settle = (ok) => {
    confirm?.resolve(ok);
    setConfirm(null);
  };

  return (
    <>
      {/* --- toast stack --- */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const tone = TONE[t.kind] || TONE.info;
          const Icon = tone.icon;
          return (
            <div key={t.id} className="ui-card ui-in-pop pointer-events-auto flex items-start gap-2.5 p-3 pr-2" style={{ boxShadow: 'var(--shadow-pop)' }}>
              <Icon size={17} className="mt-0.5 flex-shrink-0" style={{ color: `rgb(${tone.color})` }} aria-hidden="true" />
              <p className="min-w-0 flex-1 break-words text-sm leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="ui-icon-btn !h-7 !w-7 flex-shrink-0"
                aria-label="Dismiss notification"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {/* --- confirm dialog --- */}
      {confirm ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgb(0 0 0 / 0.45)' }}
            onClick={() => settle(false)}
            aria-hidden="true"
          />
          <div className="ui-card ui-in-pop relative w-full max-w-sm p-5" style={{ boxShadow: 'var(--shadow-pop)' }}>
            <h2 id="confirm-title" className="ui-t-sec">{confirm.title}</h2>
            {confirm.message ? <p className="ui-muted mt-2 text-sm leading-relaxed">{confirm.message}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => settle(false)} className="ui-btn ui-btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`ui-btn ${confirm.tone === 'danger' ? 'ui-btn-danger' : 'ui-btn-primary'}`}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
