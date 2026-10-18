// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PdfViewer } from '../../src/components/PdfViewer';

afterEach(cleanup);

describe('PdfViewer', () => {
  it('embeds the PDF with the browser\'s own viewer, not sandboxed', () => {
    render(
      <PdfViewer src="/api/projects/p1/raw/a%20b.pdf" title="a b.pdf" meta="PDF · 1 KB" actions={<button>Download</button>} />,
    );

    const frame = screen.getByTestId('pdf-frame') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('/api/projects/p1/raw/a%20b.pdf#toolbar=1&navpanes=0');
    expect(frame.getAttribute('title')).toBe('a b.pdf');
    // The built-in PDF viewer does not run inside a sandboxed frame.
    expect(frame.hasAttribute('sandbox')).toBe(false);
  });

  it('shows the meta line and the host\'s actions in the toolbar', () => {
    render(<PdfViewer src="/x.pdf" title="x" meta="PDF · 596 B" actions={<button>Download</button>} />);
    expect(screen.getByText('PDF · 596 B')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  it('busts the cache when the file changes, so an edited PDF is not stale', () => {
    const { rerender } = render(
      <PdfViewer src="/x.pdf" title="x" meta="m" actions={null} version={1} />,
    );
    expect(screen.getByTestId('pdf-frame').getAttribute('src')).toBe('/x.pdf?v=1#toolbar=1&navpanes=0');

    rerender(<PdfViewer src="/x.pdf" title="x" meta="m" actions={null} version={2} />);
    expect(screen.getByTestId('pdf-frame').getAttribute('src')).toBe('/x.pdf?v=2#toolbar=1&navpanes=0');
  });
});
