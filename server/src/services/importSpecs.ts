/**
 * Column definitions for each importable document — requirements 15 and 16.
 *
 * One place defines the columns, so the downloadable template and the validator
 * cannot drift apart. A template that no longer matches what the importer
 * accepts is worse than no template at all.
 */

export type ColumnSpec = {
  key: string;
  label: string;
  required: boolean;
  hint: string;
  /** Value used in the sample row of the downloadable template. */
  sample: string;
};

export type ImportSpec = {
  docType: string;
  label: string;
  /** Rows sharing this column belong to one document. */
  groupBy: string;
  description: string;
  columns: ColumnSpec[];
};

export const IMPORT_SPECS: Record<string, ImportSpec> = {
  JOURNAL: {
    docType: 'JOURNAL',
    label: 'Journal entries',
    groupBy: 'entry_ref',
    description:
      'One row per journal line. Lines sharing an entry_ref become a single entry, and each entry must balance — total debits equal to total credits.',
    columns: [
      { key: 'entry_ref', label: 'Entry ref', required: true, hint: 'Groups lines into one entry', sample: 'JV-001' },
      { key: 'date', label: 'Date', required: true, hint: 'YYYY-MM-DD', sample: '2026-04-01' },
      { key: 'narration', label: 'Narration', required: false, hint: 'Description of the entry', sample: 'Opening balance' },
      {
        key: 'account_code',
        label: 'Account code',
        required: true,
        hint: 'Ledger account code, as shown in the chart of accounts',
        sample: '1200',
      },
      { key: 'debit', label: 'Debit', required: false, hint: 'Amount, or blank', sample: '5000.00' },
      { key: 'credit', label: 'Credit', required: false, hint: 'Amount, or blank', sample: '' },
    ],
  },

  INVOICE: {
    docType: 'INVOICE',
    label: 'Sales invoices',
    groupBy: 'invoice_no',
    description:
      'One row per invoice line. Rows sharing an invoice_no become a single invoice. Historical numbers are kept as supplied.',
    columns: [
      { key: 'invoice_no', label: 'Invoice no', required: true, hint: 'Groups lines into one invoice', sample: 'INV-1001' },
      { key: 'date', label: 'Date', required: true, hint: 'YYYY-MM-DD', sample: '2026-04-05' },
      { key: 'customer_name', label: 'Customer', required: true, hint: 'Matched by name', sample: 'Acme Ltd' },
      { key: 'customer_gstin', label: 'Customer GSTIN', required: false, hint: 'Optional', sample: '' },
      { key: 'description', label: 'Description', required: true, hint: 'Line description', sample: 'Consulting' },
      { key: 'quantity', label: 'Quantity', required: true, hint: 'Number', sample: '1' },
      { key: 'rate', label: 'Rate', required: true, hint: 'Per unit, before tax', sample: '10000.00' },
      { key: 'gst_rate', label: 'GST %', required: false, hint: '0, 5, 12, 18 or 28', sample: '18' },
    ],
  },
};

/** Document types that have no server-side model to import into yet. */
export const UNSUPPORTED_DOC_TYPES: Record<string, string> = {
  BILL: 'Purchase bills are not stored on the server yet, so there is nothing to import them into.',
  CREDIT_NOTE: 'Credit notes are not stored on the server yet, so there is nothing to import them into.',
  DEBIT_NOTE: 'Debit notes are not stored on the server yet, so there is nothing to import them into.',
};

export const specFor = (docType: string) => IMPORT_SPECS[String(docType || '').toUpperCase()] || null;
