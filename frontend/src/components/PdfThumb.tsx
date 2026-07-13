import { useEffect, useRef, useState } from 'react';
import { fileContentUrl } from '../api';

/**
 * First-page PDF thumbnail rendered with pdf.js. The library (~400KB) is
 * dynamically imported so it stays out of the main bundle and only loads
 * when a PDF card is actually on screen.
 */
export function PdfThumb({ fileId }: { fileId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const doc = await pdfjs.getDocument(fileContentUrl(fileId)).promise;
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 320 / base.width });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      } catch (err) {
        console.warn('pdf thumbnail failed:', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (failed) return <span className="doc-icon">📄</span>;
  return <canvas ref={canvasRef} className="pdf-thumb" />;
}
