'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TableRow from '@tiptap/extension-table-row';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PaperSettings } from '@/lib/ipc';
import { paperPx, PX_PER_INCH } from '@/lib/paper';
import {
  FontSize, ParagraphFormat, VariableChip, HeaderBlock, PageBreak,
  DocTable, DocTableCell, DocTableHeader, DocImage,
} from './extensions';
import { Paginate, paginateStaticContainer, type PageMetrics } from './pagination';
import { EditorToolbar } from './toolbar';
import { VariableSidebar } from './variable-sidebar';

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150];
const OUTER_GAP = 28; // gray gap rendered between page sheets

interface DocumentEditorProps {
  content: string; // chip-format HTML (run tagsToChips before passing)
  onChange: (editorHtml: string) => void;
  paper: PaperSettings;
  previewHtml: string | null; // when set, shows the rendered preview instead of the editor
  onEditLetterhead?: () => void; // shortcut shown on the letterhead block
  hideSidebar?: boolean; // one-off documents are already resolved — no variables to insert
}

export function DocumentEditor({ content, onChange, paper, previewHtml, onEditLetterhead, hideSidebar }: DocumentEditorProps) {
  const [zoom, setZoom] = useState(100);
  const [pageCount, setPageCount] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const previewInnerRef = useRef<HTMLDivElement>(null);

  const { width: pageW, height: pageH } = paperPx(paper);
  const marginTop = paper.margins.top * PX_PER_INCH;
  const marginBottom = paper.margins.bottom * PX_PER_INCH;
  const marginLeft = paper.margins.left * PX_PER_INCH;
  const marginRight = paper.margins.right * PX_PER_INCH;
  const printableH = Math.max(pageH - marginTop - marginBottom, 100);
  const stride = printableH + marginBottom + OUTER_GAP + marginTop; // distance between page content starts

  // Live metrics for the pagination plugin (kept in a ref so the editor
  // doesn't need to be recreated when paper size or zoom changes)
  const metricsRef = useRef<PageMetrics>({ printableH, stride, zoom: zoom / 100 });
  metricsRef.current = { printableH, stride, zoom: zoom / 100 };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing your document...' }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      Subscript,
      Superscript,
      DocTable.configure({ resizable: false }),
      TableRow,
      DocTableHeader,
      DocTableCell,
      DocImage.configure({ allowBase64: true }),
      FontSize,
      ParagraphFormat,
      VariableChip,
      HeaderBlock.configure({ onEdit: onEditLetterhead || null }),
      PageBreak,
      Paginate.configure({ getMetrics: () => metricsRef.current }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Re-paginate when the paper setup changes
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta('paper-changed', true));
  }, [editor, paper, zoom]);

  // Track content height → number of page sheets to draw
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const inner = el.querySelector('.ProseMirror') as HTMLElement | null;
      const target = previewHtml ? previewInnerRef.current : inner;
      const contentH = target ? target.scrollHeight : 0;
      setPageCount(Math.max(1, Math.floor(contentH / stride) + 1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stride, previewHtml, editor]);

  // Static preview pagination (the preview is plain HTML, not a ProseMirror doc)
  useEffect(() => {
    if (!previewHtml) return;
    const target = previewInnerRef.current;
    if (!target) return;
    const run = () => paginateStaticContainer(target, { printableH, stride, zoom: zoom / 100 });
    // Wait a frame for images/fonts to lay out, then again on resize
    const raf = requestAnimationFrame(run);
    const observer = new ResizeObserver(() => requestAnimationFrame(run));
    observer.observe(target);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [previewHtml, printableH, stride, zoom]);

  if (!editor) return null;

  const totalHeight = pageCount * pageH + (pageCount - 1) * OUTER_GAP;

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-md border">
      {!previewHtml && <EditorToolbar editor={editor} />}

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="relative flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-900 p-8">
          <div style={{ zoom: zoom / 100 }}>
            <div className="relative mx-auto" style={{ width: `${pageW}px`, height: `${totalHeight}px` }}>
              {/* Page sheets (drawn behind the content) */}
              {Array.from({ length: pageCount }, (_, n) => (
                <div
                  key={n}
                  aria-hidden
                  className="absolute bg-white shadow-md"
                  style={{ top: n * (pageH + OUTER_GAP), left: 0, width: pageW, height: pageH }}
                >
                  {/* Margin guides */}
                  <div
                    className="pointer-events-none absolute border border-dashed border-blue-300/50"
                    style={{ top: marginTop, bottom: marginBottom, left: marginLeft, right: marginRight }}
                  />
                  <span className="absolute bottom-1.5 right-2.5 select-none font-sans text-[9px] text-neutral-400">
                    Page {n + 1} of {pageCount}
                  </span>
                </div>
              ))}

              {/* Document content overlaid across the sheets */}
              <div
                ref={contentRef}
                data-doc-content
                className="doc-page absolute inset-x-0 top-0"
                style={{
                  padding: `${marginTop}px ${marginRight}px 0 ${marginLeft}px`,
                  fontFamily: "'Times New Roman', Times, serif",
                  fontSize: '12pt',
                  lineHeight: 1.6,
                  color: '#000',
                }}
              >
                {previewHtml ? (
                  <div ref={previewInnerRef} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <EditorContent editor={editor} />
                )}
              </div>
            </div>
          </div>

          {/* Zoom control */}
          <div className="sticky bottom-0 left-full -mt-9 w-fit pr-1">
            <Select value={String(zoom)} onValueChange={(v) => setZoom(Number(v))}>
              <SelectTrigger className="h-7 w-[76px] bg-background text-xs shadow"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ZOOM_LEVELS.map((z) => (<SelectItem key={z} value={String(z)}>{z}%</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Variables sidebar */}
        {!previewHtml && !hideSidebar && <VariableSidebar editor={editor} />}
      </div>
    </div>
  );
}
