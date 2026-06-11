// Shared paper-size definitions for document generation.
// "Long" is the Philippine long bond paper (8.5 × 13 in), not US Legal (8.5 × 14).

export type PaperSizeKey = 'A4' | 'Letter' | 'Long';

export interface PaperSettings {
  size: PaperSizeKey;
  orientation: 'portrait' | 'landscape';
  margins: { top: number; bottom: number; left: number; right: number }; // inches
}

export const PAPER_DIMENSIONS: Record<PaperSizeKey, { widthIn: number; heightIn: number }> = {
  A4: { widthIn: 8.27, heightIn: 11.69 },
  Letter: { widthIn: 8.5, heightIn: 11 },
  Long: { widthIn: 8.5, heightIn: 13 },
};

export const DEFAULT_PAPER: PaperSettings = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 1, bottom: 1, left: 1, right: 1 },
};

export function parsePaperJson(json: string | null | undefined): PaperSettings {
  if (!json) return DEFAULT_PAPER;
  try {
    const parsed = JSON.parse(json);
    const size: PaperSizeKey = parsed.size in PAPER_DIMENSIONS ? parsed.size : 'A4';
    const m = parsed.margins || {};
    return {
      size,
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      margins: {
        top: clampMargin(m.top), bottom: clampMargin(m.bottom),
        left: clampMargin(m.left), right: clampMargin(m.right),
      },
    };
  } catch {
    return DEFAULT_PAPER;
  }
}

function clampMargin(v: any): number {
  const n = typeof v === 'number' && isFinite(v) ? v : 1;
  return Math.min(3, Math.max(0, n));
}

// CSS @page size value, e.g. "A4 portrait" or "8.5in 13in"
export function pageSizeCss(paper: PaperSettings): string {
  const dims = PAPER_DIMENSIONS[paper.size];
  const w = paper.orientation === 'landscape' ? dims.heightIn : dims.widthIn;
  const h = paper.orientation === 'landscape' ? dims.widthIn : dims.heightIn;
  return `${w}in ${h}in`;
}

// Electron printToPDF pageSize option: named sizes or {width,height} in inches
export function printToPdfPageSize(paper: PaperSettings): 'A4' | 'Letter' | { width: number; height: number } {
  if (paper.size === 'A4') return 'A4';
  if (paper.size === 'Letter') return 'Letter';
  const dims = PAPER_DIMENSIONS.Long;
  return { width: dims.widthIn, height: dims.heightIn };
}
