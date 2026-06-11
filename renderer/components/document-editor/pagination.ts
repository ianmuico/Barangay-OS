import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Word-style pagination: measures the editor's top-level blocks and inserts
// invisible spacer widgets so any block that would cross a page boundary is
// pushed to the top of the next page. The page sheets themselves are drawn by
// DocumentEditor behind the content; spacers make the text skip the gap.

export interface PageMetrics {
  printableH: number; // printable height of one page (px, unzoomed)
  stride: number;     // distance between the start of consecutive page content regions (px, unzoomed)
  zoom: number;       // current canvas zoom factor (CSS zoom)
}

export const paginationKey = new PluginKey('paginate');

const SPACER_CLASS = 'pm-page-spacer';
const TOLERANCE = 1.5;

function makeSpacer(height: number): HTMLElement {
  const div = document.createElement('div');
  div.className = SPACER_CLASS;
  div.style.height = `${height}px`;
  div.style.pointerEvents = 'none';
  div.contentEditable = 'false';
  return div;
}

export const Paginate = Extension.create<{ getMetrics: () => PageMetrics }>({
  name: 'paginate',

  addOptions() {
    return { getMetrics: () => ({ printableH: Infinity, stride: Infinity, zoom: 1 }) };
  },

  addProseMirrorPlugins() {
    const getMetrics = this.options.getMetrics;

    return [
      new Plugin({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey);
            if (meta) return meta as DecorationSet;
            if (tr.docChanged) return value.map(tr.mapping, tr.doc);
            return value;
          },
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state);
          },
        },
        view(view) {
          let scheduled = false;
          let destroyed = false;

          const measure = () => {
            if (destroyed) return;
            const { printableH, stride, zoom } = getMetrics();
            if (!isFinite(printableH) || printableH <= 50) return;
            const z = zoom || 1;
            const dom = view.dom as HTMLElement;

            // Walk rendered children: separate real blocks from our spacers
            const domTop = dom.getBoundingClientRect().top;
            const blockEls: HTMLElement[] = [];
            const naturalTops: number[] = [];
            const blockHeights: number[] = [];
            const currentSpacerBefore: number[] = [];
            let cumSpacer = 0;
            let pendingSpacer = 0;

            for (const child of Array.from(dom.children) as HTMLElement[]) {
              if (child.classList.contains(SPACER_CLASS)) {
                const h = child.getBoundingClientRect().height / z;
                cumSpacer += h;
                pendingSpacer += h;
                continue;
              }
              if (child.classList.contains('ProseMirror-gapcursor')) continue;
              const rect = child.getBoundingClientRect();
              blockEls.push(child);
              naturalTops.push((rect.top - domTop) / z - cumSpacer);
              blockHeights.push(rect.height / z);
              currentSpacerBefore.push(pendingSpacer);
              pendingSpacer = 0;
            }

            // Map blocks to document positions — bail out if they don't line up
            const positions: { pos: number; isPageBreak: boolean }[] = [];
            view.state.doc.forEach((node, offset) => {
              positions.push({ pos: offset, isPageBreak: node.type.name === 'pageBreak' });
            });
            if (positions.length !== blockEls.length) return;

            // Simulate the flow and compute the spacer needed before each block
            let shift = 0;
            let forceNext = false;
            const wanted: number[] = [];
            for (let i = 0; i < blockEls.length; i++) {
              const top = naturalTops[i] + shift;
              const h = blockHeights[i];
              const pageIdx = Math.max(0, Math.floor((top + 0.5) / stride));
              const regionEnd = pageIdx * stride + printableH;
              const nextStart = (pageIdx + 1) * stride;
              let push = 0;
              if (forceNext) {
                push = nextStart - top;
                forceNext = false;
              } else if (top > regionEnd - 0.5) {
                push = nextStart - top; // landed inside the gap
              } else if (top + h > regionEnd + 0.5 && h <= printableH) {
                push = nextStart - top; // crosses the boundary but fits on one page
              }
              if (positions[i].isPageBreak) forceNext = true;
              wanted.push(push > 0.5 ? push : 0);
              shift += wanted[i];
            }

            const changed = wanted.some((w, i) => Math.abs(w - (currentSpacerBefore[i] || 0)) > TOLERANCE);
            if (!changed) return;

            const decorations = wanted
              .map((push, i) => push > 0.5
                ? Decoration.widget(positions[i].pos, () => makeSpacer(push), { side: -1, key: `spacer-${i}-${Math.round(push)}` })
                : null)
              .filter(Boolean) as Decoration[];

            view.dispatch(view.state.tr.setMeta(paginationKey, DecorationSet.create(view.state.doc, decorations)));
          };

          const schedule = () => {
            if (scheduled || destroyed) return;
            scheduled = true;
            requestAnimationFrame(() => {
              scheduled = false;
              measure();
            });
          };

          // Re-measure when content size changes (images loading, fonts, etc.)
          const resizeObserver = new ResizeObserver(schedule);
          resizeObserver.observe(view.dom);
          schedule();

          return {
            update: schedule,
            destroy() {
              destroyed = true;
              resizeObserver.disconnect();
            },
          };
        },
      }),
    ];
  },
});

// Same algorithm for static (preview) HTML — mutates the container directly.
export function paginateStaticContainer(container: HTMLElement, metrics: PageMetrics): void {
  const z = metrics.zoom || 1;
  if (!isFinite(metrics.printableH) || metrics.printableH <= 50) return;

  container.querySelectorAll(`.${SPACER_CLASS}`).forEach(el => el.remove());

  const containerTop = container.getBoundingClientRect().top;
  const blocks = (Array.from(container.children) as HTMLElement[]);
  let shift = 0;
  for (const el of blocks) {
    const rect = el.getBoundingClientRect();
    const top = (rect.top - containerTop) / z + shift;
    const h = rect.height / z;
    const pageIdx = Math.max(0, Math.floor((top + 0.5) / metrics.stride));
    const regionEnd = pageIdx * metrics.stride + metrics.printableH;
    const nextStart = (pageIdx + 1) * metrics.stride;
    let push = 0;
    if (top > regionEnd - 0.5) push = nextStart - top;
    else if (top + h > regionEnd + 0.5 && h <= metrics.printableH) push = nextStart - top;
    if (push > 0.5) {
      container.insertBefore(makeSpacer(push), el);
      shift += push;
    }
  }
}
