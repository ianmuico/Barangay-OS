'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaperSettings } from '@/lib/ipc';
import { paperPx, PX_PER_INCH } from '@/lib/paper';
import { resolvePreviewHtml, type PreviewContext } from '@/components/document-editor/serialize';

// A real, scaled-down render of a template — like a shrunk sheet of paper —
// resolved with the barangay letterhead + sample data. Used as card previews.
export function TemplateThumbnail({ html, paper, ctx, height = 210 }: {
  html: string;
  paper: PaperSettings;
  ctx: PreviewContext | null;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const { width: pageW } = paperPx(paper);

  const resolved = useMemo(() => (ctx ? resolvePreviewHtml(html, ctx) : ''), [html, ctx]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / pageW);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [pageW]);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded border bg-white"
      style={{ height }}
    >
      {ctx ? (
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 0, left: 0, width: pageW,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            padding: `${paper.margins.top * PX_PER_INCH}px ${paper.margins.right * PX_PER_INCH}px 0 ${paper.margins.left * PX_PER_INCH}px`,
            fontFamily: "'Times New Roman', Times, serif", fontSize: '12pt', lineHeight: 1.6, color: '#000',
            pointerEvents: 'none',
          }}
          dangerouslySetInnerHTML={{ __html: resolved }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading preview…</div>
      )}
      {/* Fade the bottom so the clipped page looks intentional */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}
