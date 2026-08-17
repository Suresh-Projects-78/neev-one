import React, { useEffect, useState } from 'react';
import { BadgeCheck, Check, Mail, Save, ShieldAlert, UserRound } from 'lucide-react';

import { getProfile, updateProfile } from '../../api/profile';
import { resendVerification } from '../../api/email';
import { PageHeader, Spinner } from '../../components/ui/Primitives';

/** The signed-in user's own details. */
export const ProfileSettings = () => {
  const [me, setMe] = useState(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(getProfile)
      .then((d) => {
        if (cancelled) return;
        setMe(d);
        setFullName(d?.user?.fullName || '');
      })
      .catch((e) => !cancelled && setError(String(e?.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (key, fn, note) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      if (note) setNotice(note);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="ui-card p-8 flex items-center justify-center gap-3">
        <Spinner />
        <span className="ui-muted text-sm">Loading your profile…</span>
      </div>
    );
  }

  const user = me?.user || {};
  const verified = Boolean(user.emailVerifiedAt);
  const dirty = fullName.trim() !== String(user.fullName || '').trim();
  const initials = String(user.email || '?').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      <PageHeader
        title="My profile"
        description="Your details and where you have access."
        actions={
          notice ? (
            <span className="ui-pill ui-pill-pos" role="status">
              <Check size={11} aria-hidden="true" /> {notice}
            </span>
          ) : null
        }
      />

      {error ? (
        <div
          className="ui-card p-3 text-sm"
          role="alert"
          style={{ borderColor: 'rgb(var(--neg))', color: 'rgb(var(--neg))' }}
        >
          {error}
        </div>
      ) : null}

      <div className="ui-card p-4">
        <div className="flex items-start gap-4">
          <span
            className="h-12 w-12 rounded-full inline-flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: 'rgb(var(--surface-sunken))', color: 'rgb(var(--fg-muted))' }}
            aria-hidden="true"
          >
            {initials}
          </span>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="ui-label" htmlFor="me-name">
                  Full name
                </label>
                <input
                  id="me-name"
                  className="ui-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label className="ui-label" htmlFor="me-email">
                  Email
                </label>
                <input id="me-email" className="ui-input" value={user.email || ''} readOnly disabled />
                <div className="ui-subtle text-xs mt-1">
                  Changing the sign-in address is done by an administrator.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                disabled={!dirty || busy === 'name'}
                onClick={() =>
                  run(
                    'name',
                    async () => {
                      const r = await updateProfile(fullName.trim());
                      setMe((prev) => ({ ...prev, user: { ...prev.user, ...r.user } }));
                    },
                    'Saved'
                  )
                }
              >
                {busy === 'name' ? <Spinner /> : <Save size={15} aria-hidden="true" />} Save
              </button>

              {verified ? (
                <span className="ui-pill ui-pill-pos">
                  <BadgeCheck size={11} aria-hidden="true" /> Email confirmed
                </span>
              ) : (
                <>
                  <span className="ui-pill ui-pill-warn">
                    <ShieldAlert size={11} aria-hidden="true" /> Not confirmed
                  </span>
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary"
                    disabled={busy === 'verify'}
                    onClick={() => run('verify', resendVerification, 'Verification link sent')}
                  >
                    <Mail size={15} aria-hidden="true" /> Send the link
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="ui-card p-4">
        <div className="ui-title text-sm mb-2">Access</div>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="ui-muted text-xs">Organisations</dt>
            <dd className="ui-title">
              {(me?.orgs || []).map((o) => o.org?.name).filter(Boolean).join(', ') || '—'}
            </dd>
          </div>
          <div>
            <dt className="ui-muted text-xs">Role in this organisation</dt>
            <dd className="ui-title">{me?.isOrgAdmin ? 'Administrator' : 'Member'}</dd>
          </div>
          <div>
            <dt className="ui-muted text-xs">Branches you can access</dt>
            <dd className="ui-title">{(me?.allowedBranchIds || []).length || '—'}</dd>
          </div>
          <div>
            <dt className="ui-muted text-xs">Account ID</dt>
            <dd className="ui-mono text-xs">{user.accountId || '—'}</dd>
          </div>
        </dl>
        <p className="ui-subtle text-xs mt-3">
          <UserRound size={11} className="inline" aria-hidden="true" /> Password, devices and sign-in activity are
          under Settings &rarr; Security.
        </p>
      </div>
    </div>
  );
};

export default ProfileSettings;
