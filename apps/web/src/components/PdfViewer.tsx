import type { ReactNode } from 'react';
import styles from './PdfViewer.module.css';

/**
 * Shows a PDF with the browser's own PDF viewer (Chromium, and so Electron, has
 * one built in): page navigation, zoom, search and printing for free, and no
 * PDF engine of our own to ship. The frame is deliberately not sandboxed, since
 * the built-in viewer does not run inside a sandboxed frame.
 *
 * Presentational: the file's meta line and its action buttons come from the host
 * (`FileViewer`), so this stays the same shape as the other viewers' toolbar.
 */
export function PdfViewer({
  src,
  title,
  meta,
  actions,
  version,
}: {
  /** Same-origin URL that serves the PDF inline. */
  src: string;
  title: string;
  meta: ReactNode;
  actions: ReactNode;
  /** Changes when the file does, so an edited PDF is not served from cache. */
  version?: string | number | null;
}) {
  const url = `${src}${version !== undefined && version !== null ? `?v=${encodeURIComponent(String(version))}` : ''}#toolbar=1&navpanes=0`;
  return (
    <div className="viewer document-viewer" data-testid="pdf-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">{meta}</span>
        </div>
        {actions}
      </div>
      <div className={`viewer-body ${styles.body}`}>
        <iframe className={styles.frame} src={url} title={title} data-testid="pdf-frame" />
      </div>
    </div>
  );
}
