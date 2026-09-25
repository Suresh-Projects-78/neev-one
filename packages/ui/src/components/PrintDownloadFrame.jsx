import React, { useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { notify } from './ui/notify';

/**
 * Print and Download, around any document that can be put on paper.
 *
 * This was written for the invoice and lived inside the sales module, so it was
 * the only document in the product anybody could hand to a customer. Nothing in
 * it was ever invoice-specific — it sets the page title so the browser's own
 * print header carries the document number, puts the app into print-mode and
 * renders whatever it is given — so it is now the frame every document uses.
 *
 * @param title     what this is, shown above the paper
 * @param fileBase  the document number; becomes the PDF's filename
 */
export const PrintDownloadFrame = ({ title, fileBase, children }) => {
  const paperRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const docNumber = String(fileBase || '').trim();

  const doPrint = () => {
    try {
      const prevTitle = document.title;
      if (docNumber) document.title = docNumber;

      document.body.classList.add('print-mode');
      const cleanup = () => {
        document.body.classList.remove('print-mode');
        document.title = prevTitle;
      };
      window.addEventListener('afterprint', cleanup, { once: true });
      window.print();

      // afterprint does not fire everywhere; the app must not be left in
      // print-mode either way.
      window.setTimeout(cleanup, 1200);
    } catch {
      // ignore
    }
  };

  const doDownload = async () => {
    const el = paperRef.current;
    if (!el || downloading) return;

    setDownloading(true);
    const prevTitle = document.title;
    const filenameBase = (docNumber || 'document').replace(/[\\/:*?"<>|]/g, '-').trim() || 'document';

    try {
      if (docNumber) document.title = docNumber;
      document.body.classList.add('print-mode');

      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

      await new Promise((resolve) => {
        doc.html(el, {
          x: 18,
          y: 18,
          width: 559, // A4 width (595pt) - 18pt margins on both sides
          windowWidth: Math.max(el.scrollWidth || 0, 980),
          margin: [18, 18, 18, 18],
          autoPaging: 'text',
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
          },
          callback: () => resolve(),
        });
      });

      doc.save(`${filenameBase}.pdf`);
    } catch {
      notify.error('Unable to generate PDF. Please try again.');
    } finally {
      document.body.classList.remove('print-mode');
      document.title = prevTitle;
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="ui-muted text-sm">{title}</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={doPrint} className="ui-btn ui-btn-secondary">
            <Printer size={16} /> Print
          </button>
          <button
            type="button"
            onClick={doDownload}
            disabled={downloading}
            className="px-3 py-2 rounded-lg ui-btn ui-btn-primary flex items-center gap-2"
          >
            <Download size={16} /> {downloading ? 'Preparing...' : 'Download'}
          </button>
        </div>
      </div>

      <div ref={paperRef}>{children}</div>
    </div>
  );
};

export default PrintDownloadFrame;
