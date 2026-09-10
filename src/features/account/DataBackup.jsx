import React, { useState } from 'react';
import { Download, HardDriveDownload, Share2 } from 'lucide-react';

import { PageHeader } from '../../components/ui/Primitives';
import NotConnected from '../../components/ui/NotConnected';
import { notify } from '../../components/ui/notify';
import { exportCompanyData } from '../../api/dataExport';

/**
 * Taking a copy of this company's books.
 *
 * Deliberately not "system backup". The database backup is the operator's tool
 * — it is every customer's books in one file and no customer should ever hold
 * one. This is the other thing: one company's own data, for the people whose
 * data it is, in a file they can keep, read and take elsewhere.
 *
 * A customer who cannot get their data out is a customer who is locked in, and
 * the fastest way to lose trust is for that to be true.
 */

const Row = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
    <span className="ui-muted">{label}</span>
    <span className="ui-money">{value}</span>
  </div>
);

export default function DataBackup({ currentCompany }) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const payload = await exportCompanyData();
      const counts = payload?.export?.counts || {};
      const rows = Object.values(counts).reduce((n, c) => n + Number(c || 0), 0);

      const stamp = new Date().toISOString().slice(0, 10);
      const name = String(currentCompany?.name || 'company').replace(/[\\/:*?"<>|]+/g, '-');
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setLast({ at: new Date(), rows, counts, size: blob.size });
      notify.success(`${rows.toLocaleString('en-IN')} records downloaded.`);
    } catch (e) {
      notify.error(`Could not take the backup: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  };

  const kb = (n) => `${Math.max(1, Math.round(Number(n || 0) / 1024)).toLocaleString('en-IN')} KB`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Backup"
        description="A copy of this company's own books — masters, documents and the ledger — in a file you can keep."
      />

      <div className="ui-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <HardDriveDownload size={18} aria-hidden="true" className="ui-muted mt-0.5" />
            <div className="max-w-xl">
              <div className="ui-label">Download a backup</div>
              <p className="mt-1 text-sm ui-muted">
                Everything belonging to {currentCompany?.name || 'this company'}: customers and vendors, items,
                invoices, bills, receipts, payments, the chart of accounts and every journal entry behind them.
                Readable JSON, so it can be opened and checked rather than taken on trust.
              </p>
              <p className="mt-2 text-sm ui-muted">
                It holds no other company&apos;s data, and no passwords or sign-in details.
              </p>
            </div>
          </div>
          <button type="button" onClick={download} disabled={busy} className="ui-btn ui-btn-primary">
            <Download size={15} aria-hidden="true" /> {busy ? 'Preparing…' : 'Download backup'}
          </button>
        </div>

        {last ? (
          <div className="mt-4 border-t pt-3">
            <div className="ui-label mb-1">Last taken</div>
            <div className="max-w-sm">
              <Row label="When" value={last.at.toLocaleString()} />
              <Row label="Records" value={last.rows.toLocaleString('en-IN')} />
              <Row label="File size" value={kb(last.size)} />
              <Row label="Invoices" value={Number(last.counts.invoices || 0).toLocaleString('en-IN')} />
              <Row label="Journal entries" value={Number(last.counts.journalEntries || 0).toLocaleString('en-IN')} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="ui-card p-4">
        <div className="flex items-start gap-3">
          <Share2 size={18} aria-hidden="true" className="ui-muted mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="ui-label">Send it somewhere automatically</div>
            <div className="mt-3">
              <NotConnected what="scheduled backup to a shared location">
                A nightly copy to SharePoint, Google Drive, a network share or object storage needs an account to send
                it to and permission to write there. Neither exists yet, so nothing is scheduled and nothing is being
                sent. Download above is the whole of it today.
              </NotConnected>
            </div>
          </div>
        </div>
      </div>

      <div className="ui-card p-4">
        <div className="ui-label">Restoring</div>
        <p className="mt-1 max-w-2xl text-sm ui-muted">
          Reading a backup back in is not offered yet, and that is deliberate rather than forgotten. Restoring into a
          company that already has data has to decide what happens to every record that exists in both — and a restore
          that silently duplicates a year of invoices is worse than no restore at all. Until that is built, the file
          above is a record you can read, audit and hand to an accountant, not a one-click undo.
        </p>
      </div>
    </div>
  );
}
