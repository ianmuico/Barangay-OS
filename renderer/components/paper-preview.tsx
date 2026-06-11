'use client';

import { useEffect, useRef, useState } from 'react';
import type { PaperSettings } from '@/lib/ipc';
import { DEFAULT_PAPER, paperPx, PX_PER_INCH } from '@/lib/paper';
import { paginateStaticContainer } from '@/components/document-editor/pagination';
import { resolveHeaderForDisplay } from '@/components/document-editor/serialize';

const OUTER_GAP = 24;

interface PaperPreviewProps {
  html: string;
  paper?: PaperSettings;
  /** Available width in px — the page scales down to fit, keeping the true paper ratio */
  fitWidth?: number;
}

// Read-only document preview that renders EXACTLY like the editor and print:
// real paper sheets at the correct ratio, content flowing across separate
// pages, letterhead markers resolved to the current barangay header.
export function PaperPreview({ html, paper = DEFAULT_PAPER, fitWidth = 760 }: PaperPreviewProps) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const innerRef = useRef<HTMLDivElement>(null);

  const { width: pageW, height: pageH } = paperPx(paper);
  const marginTop = paper.margins.top * PX_PER_INCH;
  const marginBottom = paper.margins.bottom * PX_PER_INCH;
  const marginLeft = paper.margins.left * PX_PER_INCH;
  const marginRight = paper.margins.right * PX_PER_INCH;
  const printableH = Math.max(pageH - marginTop - marginBottom, 100);
  const stride = printableH + marginBottom + OUTER_GAP + marginTop;
  const zoom = Math.min(1, fitWidth / pageW);

  useEffect(() => {
    let cancelled = false;
    resolveHeaderForDisplay(html).then((out) => { if (!cancelled) setResolved(out); });
    return () => { cancelled = true; };
  }, [html]);

  // Paginate the static content and track how many sheets to draw
  useEffect(() => {
    const target = innerRef.current;
    if (!target || resolved === null) return;
    const run = () => {
      paginateStaticContainer(target, { printableH, stride, zoom });
      setPageCount(Math.max(1, Math.floor(target.scrollHeight / stride) + 1));
    };
    const raf = requestAnimationFrame(run);
    const observer = new ResizeObserver(() => requestAnimationFrame(run));
    observer.observe(target);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [resolved, printableH, stride, zoom]);

  if (resolved === null) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading preview...</div>;
  }

  const totalHeight = pageCount * pageH + (pageCount - 1) * OUTER_GAP;

  return (
    <div style={{ zoom }}>
      <div className="relative mx-auto" style={{ width: `${pageW}px`, height: `${totalHeight}px` }}>
        {/* Page sheets */}
        {Array.from({ length: pageCount }, (_, n) => (
          <div
            key={n}
            aria-hidden
            className="absolute bg-white shadow-md"
            style={{ top: n * (pageH + OUTER_GAP), left: 0, width: pageW, height: pageH }}
          >
            <span className="absolute bottom-1.5 right-2.5 select-none font-sans text-[9px] text-neutral-400">
              Page {n + 1} of {pageCount}
            </span>
          </div>
        ))}

        {/* Document content flowing across the sheets */}
        <div
          className="absolute inset-x-0 top-0 text-black"
          style={{
            padding: `${marginTop}px ${marginRight}px 0 ${marginLeft}px`,
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: '12pt',
            lineHeight: 1.6,
          }}
        >
          <div ref={innerRef} dangerouslySetInnerHTML={{ __html: resolved }} />
        </div>
      </div>
    </div>
  );
}
