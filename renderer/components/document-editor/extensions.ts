import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { HeaderBlockView } from './header-block-view';
import { ImageView } from './image-view';

// ─── Tables with border controls ─────────────────────────────────────────────
// data-borderless on the table hides every border; data-no-border on a cell
// hides just that cell's borders. The editor shows faint dashed guides for
// hidden borders (so the structure stays visible); printing hides them fully.
export const DocTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderless: {
        default: false,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-borderless') === 'true',
        renderHTML: (attrs) => (attrs.borderless ? { 'data-borderless': 'true' } : {}),
      },
    };
  },
});

const cellBorderAttributes = {
  noBorder: {
    default: false,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-no-border') === 'true',
    renderHTML: (attrs: Record<string, any>) => (attrs.noBorder ? { 'data-no-border': 'true' } : {}),
  },
};

export const DocTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellBorderAttributes };
  },
});

export const DocTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellBorderAttributes };
  },
});

// ─── Images with text wrap, sizing, and drag ────────────────────────────────
export function imageStyle(attrs: Record<string, any>): string {
  const width = attrs.width ? `width:${attrs.width}%;` : 'max-width:100%;';
  if (attrs.float === 'left') return `${width}float:left;margin:4px 16px 8px 0;`;
  if (attrs.float === 'right') return `${width}float:right;margin:4px 0 8px 16px;`;
  return `${width}display:block;margin:8px auto;`;
}

export const DocImage = Image.extend({
  inline: false,
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null, // percent of page width
        parseHTML: (el) => {
          const w = (el as HTMLElement).style.width;
          return w && w.endsWith('%') ? parseInt(w, 10) : null;
        },
        renderHTML: () => ({}),
      },
      float: {
        default: 'none', // 'none' (centered block) | 'left' | 'right' (text wraps)
        parseHTML: (el) => {
          const f = (el as HTMLElement).style.float;
          return f === 'left' || f === 'right' ? f : 'none';
        },
        renderHTML: () => ({}),
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { style: imageStyle(node.attrs) })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

// ─── Variable chip ───────────────────────────────────────────────────────────
// Inline atom representing a {{...}} placeholder. Rendered as a colored pill in
// the editor; converted back to the raw {{...}} tag on save (see serialize.ts).
export type ChipKind = 'var' | 'input' | 'signatory' | 'official';

export const CHIP_STYLE: Record<ChipKind, string> = {
  var: 'background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe;',
  input: 'background:#fef3c7;color:#b45309;border:1px solid #fde68a;',
  signatory: 'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;',
  official: 'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;',
};

// display:inline (not inline-block) so the pill hugs its text exactly and
// flows with the line; width is always content-driven.
const CHIP_BASE_STYLE = 'display:inline;width:auto;padding:1px 5px;border-radius:4px;font-size:0.85em;font-weight:normal;font-family:ui-sans-serif,system-ui,sans-serif;white-space:nowrap;text-align:center;vertical-align:baseline;box-decoration-break:clone;user-select:none;';

export const VariableChip = Node.create({
  name: 'variableChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: 'var' },
      key: { default: '' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [{
      tag: 'span[data-chip]',
      getAttrs: (el) => {
        const e = el as HTMLElement;
        return {
          kind: e.getAttribute('data-chip') || 'var',
          key: e.getAttribute('data-key') || '',
          label: e.getAttribute('data-label') || e.textContent || '',
        };
      },
    }];
  },

  renderHTML({ node }) {
    const kind = (node.attrs.kind || 'var') as ChipKind;
    const label = node.attrs.label || node.attrs.key;
    return ['span', mergeAttributes({
      'data-chip': kind,
      'data-key': node.attrs.key,
      'data-label': label,
      style: CHIP_BASE_STYLE + (CHIP_STYLE[kind] || CHIP_STYLE.var),
      contenteditable: 'false',
    }), label];
  },
});

// ─── Letterhead block ────────────────────────────────────────────────────────
// Block atom for the {{header}} tag — shows a letterhead placeholder banner.
export const HeaderBlock = Node.create<{ onEdit: (() => void) | null }>({
  name: 'headerBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    return { onEdit: null };
  },

  parseHTML() {
    return [{ tag: 'div[data-chip-block="header"]' }];
  },

  // Serialized form stays a plain marker div — the live letterhead preview is
  // editor-only (see HeaderBlockView); the real header is built at generation time.
  renderHTML() {
    return ['div', { 'data-chip-block': 'header' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HeaderBlockView);
  },
});

// ─── Page break ──────────────────────────────────────────────────────────────
// Serialized with an inline style so the saved HTML prints correctly without
// any post-processing. Styled in the editor via the [data-page-break] selector.
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML() {
    return ['div', {
      'data-page-break': 'true',
      style: 'page-break-after:always;break-after:page;',
    }];
  },
});

// ─── Font size (global attribute on textStyle mark) ─────────────────────────
// Applied from the toolbar with: editor.chain().setMark('textStyle', { fontSize: '14pt' })
export const FontSize = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
});

// ─── Line height + indent (paragraph/heading attributes) ────────────────────
// Applied with editor.chain().updateAttributes('paragraph', { lineHeight: '1.5' })
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.lineHeight || null,
          renderHTML: (attrs) => attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {},
        },
        indent: {
          default: 0,
          parseHTML: (el) => {
            const ml = parseInt((el as HTMLElement).style.marginLeft || '0', 10);
            return ml > 0 ? Math.round(ml / 40) : 0;
          },
          renderHTML: (attrs) => attrs.indent > 0 ? { style: `margin-left: ${attrs.indent * 40}px` } : {},
        },
        textIndent: {
          default: false,
          parseHTML: (el) => !!(el as HTMLElement).style.textIndent,
          renderHTML: (attrs) => attrs.textIndent ? { style: 'text-indent: 40px' } : {},
        },
      },
    }];
  },
});
