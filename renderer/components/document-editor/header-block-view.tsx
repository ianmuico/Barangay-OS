'use client';

import { useEffect, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Pencil } from 'lucide-react';
import { getAPI } from '@/lib/ipc';
import { buildLetterheadHtml } from './serialize';

// Editor-only view for the {{header}} block: renders the actual letterhead
// (logo + barangay details, or the custom header template) instead of a
// generic placeholder, with a shortcut to edit it in Settings → Barangay.
export function HeaderBlockView(props: NodeViewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const onEdit = (props.extension.options as { onEdit?: () => void }).onEdit;

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    let cancelled = false;
    (async () => {
      const [barangay, municipality, province, headerTemplate, logo] = await Promise.all([
        api.getSetting('barangay_name'),
        api.getSetting('municipality'),
        api.getSetting('province'),
        api.getSetting('header_template'),
        api.getLogoBase64(),
      ]);
      if (cancelled) return;
      setHtml(buildLetterheadHtml({
        barangay: barangay || '',
        municipality: municipality || '',
        province: province || '',
        headerTemplate: headerTemplate || null,
        logoDataUrl: logo,
      }));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <NodeViewWrapper className="group relative rounded-sm" data-drag-handle>
      <div
        className="rounded-sm outline outline-1 outline-dashed outline-blue-300/70"
        contentEditable={false}
      >
        {html === null ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Loading letterhead...</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
      <div className="pointer-events-none absolute -top-2.5 left-2 rounded bg-blue-500 px-1.5 py-0.5 text-[9px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
        Barangay Letterhead — auto-filled from Settings
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          contentEditable={false}
          className="absolute -top-2.5 right-2 flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
          title="Edit the letterhead design in Settings → Barangay"
        >
          <Pencil className="h-2.5 w-2.5" /> Edit Letterhead
        </button>
      )}
    </NodeViewWrapper>
  );
}
