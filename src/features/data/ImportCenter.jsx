import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Upload, ChevronLeft } from 'lucide-react';

import {
  commitImport,
  downloadTemplate,
  listImportSpecs,
  stageImport,
  validateImport,
} from '../../api/imports';
import { PageHeader, Spinner } from '../../components/ui/Primitives';

/**
 * Document import — requirements 15 and 16.
 *
 * The screen follows the server's three steps rather than hiding them behind
 * one button: choose and stage, see every problem, then commit. Hiding the
 * middle step is what produces an import nobody trusts.
 */

const saveTextAsFile = (text, filename) => {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function ImportCenter({ onBack = null }) {
  const [specs, setSpecs] = useState([]);
  const [unsupported, setUnsupported] = useState([]);
  const [docType, setDocType] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');

  const [batch, setBatch] = useState(null);
  const [issues, setIssues] = useState([]);
  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const spec = useMemo(() => specs.find((s) => s.docType === docType) || null, [specs, docType]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listImportSpecs();
        if (cancelled) return;
        setSpecs(data?.specs || []);
        setUnsupported(data?.unsupported || []);
        setDocType(data?.specs?.[0]?.docType || '');
        setError('');
      } catch (e) {
        if (!cancelled) setError(String(e?.message || 'Could not load import types.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Any new file invalidates whatever was staged before it. */
  const resetRun = () => {
    setBatch(null);
    setIssues([]);
    setResult(null);
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    resetRun();
  };

  const onTemplate = async () => {
    setBusy(true);
    try {
      const text = await downloadTemplate(docType);
      saveTextAsFile(text, `${docType.toLowerCase()}-template.csv`);
      setError('');
    } catch (e) {
      setError(String(e?.message || 'Could not download the template.'));
    } finally {
      setBusy(false);
    }
  };

  const onStageAndValidate = async () => {
    setBusy(true);
    try {
      const staged = await stageImport({ docType, csv, fileName: fileName || null });
      const checked = await validateImport(staged.batch.id);
      setBatch(checked.batch);
      setIssues(checked.issues || []);
      setResult(null);
      setError('');
    } catch (e) {
      setError(String(e?.message || 'Could not read that file.'));
      setBatch(null);
    } finally {
      setBusy(false);
    }
  };

  const onCommit = async () => {
    setBusy(true);
    try {
      const done = await commitImport(batch.id);
      setResult(done);
      setBatch(done.batch);
      setError('');
    } catch (e) {
      setError(String(e?.message || 'Could not commit the import.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Import data"
        description="Files are checked before anything is written. You see every problem first, and rows that are fine still go through."
        actions={
          /* This screen is reached from a list's More menu, which navigates
             away from that list. Without a way back it was a dead end — the
             only exit was the navigation rail, which does not remember where
             you came from. */
          onBack ? (
            <button type="button" onClick={onBack} className="ui-btn ui-btn-secondary">
              <ChevronLeft size={15} aria-hidden="true" /> Back
            </button>
          ) : null
        }
      />

      {error ? (
        <div className="rounded-lg border border-[rgb(var(--neg)/0.35)] bg-[rgb(var(--neg-soft))] px-4 py-3 text-sm text-[rgb(var(--neg))]">{error}</div>
      ) : null}

      <div className="ui-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">What are you importing?</label>
            <select
              value={docType}
              onChange={(e) => {
                setDocType(e.target.value);
                resetRun();
              }}
              className="ui-select"
            >
              {specs.map((s) => (
                <option key={s.docType} value={s.docType}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={onTemplate} disabled={busy || !docType} className="ui-btn ui-btn-secondary disabled:opacity-50">
              <Download size={16} className="inline mr-1" /> Download template
            </button>
          </div>
          <div className="flex items-end">
            <label className="ui-btn ui-btn-secondary cursor-pointer">
              <FileUp size={16} className="inline mr-1" /> Choose CSV
              <input type="file" accept=".csv,text/csv" onChange={onPickFile} className="hidden" />
            </label>
          </div>
        </div>

        {spec ? <p className="text-sm ui-muted">{spec.description}</p> : null}

        {spec ? (
          <details className="text-sm">
            <summary className="cursor-pointer ui-muted">Columns this file needs</summary>
            <ul className="mt-2 space-y-1">
              {spec.columns.map((c) => (
                <li key={c.key}>
                  <code className="font-mono">{c.key}</code>
                  {c.required ? <span className="text-[rgb(var(--neg))]"> *</span> : null} — {c.hint}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div>
          <label className="block text-sm font-medium mb-1">
            CSV content {fileName ? <span className="ui-muted">({fileName})</span> : null}
          </label>
          <textarea
            rows={8}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              resetRun();
            }}
            className="ui-input font-mono text-xs"
            placeholder="Paste the file here, or choose one above."
          />
        </div>

        <button
          type="button"
          onClick={onStageAndValidate}
          disabled={busy || !csv.trim() || !docType}
          className="ui-btn ui-btn-primary disabled:opacity-50"
        >
          <Upload size={16} className="inline mr-1" /> {busy ? 'Checking…' : 'Check the file'}
        </button>
      </div>

      {unsupported.length ? (
        <div className="ui-card p-4 text-sm">
          <h3 className="font-semibold mb-1">Not importable yet</h3>
          <ul className="space-y-1 ui-muted">
            {unsupported.map((u) => (
              <li key={u.docType}>
                <strong>{u.docType}</strong> — {u.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {batch ? (
        <div className="ui-card p-4 space-y-3">
          <h3 className="font-semibold">
            {batch.totalRows} row{batch.totalRows === 1 ? '' : 's'} read — {batch.validRows} ready,{' '}
            {batch.errorRows} with problems
          </h3>

          {issues.length ? (
            <div className="overflow-x-auto">
              <div className="flex items-center gap-2 mb-2 text-sm text-[rgb(var(--warn-ink))]">
                <AlertTriangle size={16} /> These rows will be skipped. Line numbers match the file.
              </div>
              <table className="ui-table w-full text-sm">
                <thead>
                  <tr className="text-left ui-muted">
                    <th className="px-3 py-2 w-24">Line</th>
                    <th className="px-3 py-2">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.slice(0, 200).map((i) => (
                    <tr key={i.rowNumber} className="border-t">
                      <td className="ui-col-meta px-3 py-2 tabular-nums">{i.rowNumber}</td>
                      <td className="ui-col-meta px-3 py-2">{i.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {issues.length > 200 ? (
                <p className="mt-2 text-xs ui-muted">Showing the first 200 of {issues.length} problems.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[rgb(var(--pos))] flex items-center gap-2">
              <CheckCircle2 size={16} /> No problems found.
            </p>
          )}

          <button
            type="button"
            onClick={onCommit}
            disabled={busy || batch.validRows === 0}
            className="ui-btn ui-btn-primary disabled:opacity-50"
          >
            {busy ? 'Importing…' : `Import ${batch.validRows} row${batch.validRows === 1 ? '' : 's'}`}
          </button>
          {batch.validRows === 0 ? (
            <p className="text-xs ui-muted">Nothing can be imported until at least one row is clean.</p>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-lg border border-[rgb(var(--pos)/0.35)] bg-[rgb(var(--pos-soft))] px-4 py-3 text-sm text-green-800">
          Imported {result.committed} row{result.committed === 1 ? '' : 's'}.
          {result.failures?.length ? (
            <ul className="mt-2 space-y-1 text-[rgb(var(--neg))]">
              {result.failures.map((f) => (
                <li key={f.group}>
                  {f.group}: {f.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
