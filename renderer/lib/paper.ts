import type { PaperSettings } from './ipc';

// "Long" is the Philippine long bond paper (8.5 × 13 in), not US Legal (8.5 × 14).
export const PAPER_SIZES: Record<PaperSettings['size'], { label: string; widthIn: number; heightIn: number }> = {
  A4: { label: 'A4 (210 × 297 mm)', widthIn: 8.27, heightIn: 11.69 },
  Letter: { label: 'Letter / Short (8.5 × 11 in)', widthIn: 8.5, heightIn: 11 },
  Long: { label: 'Long Bond (8.5 × 13 in)', widthIn: 8.5, heightIn: 13 },
};

export const DEFAULT_PAPER: PaperSettings = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 1, bottom: 1, left: 1, right: 1 },
};

export const PX_PER_INCH = 96;

export function parsePaperJson(json: string | null | undefined): PaperSettings {
  if (!json) return DEFAULT_PAPER;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || !(parsed.size in PAPER_SIZES)) return DEFAULT_PAPER;
    return {
      size: parsed.size,
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      margins: {
        top: num(parsed.margins?.top), bottom: num(parsed.margins?.bottom),
        left: num(parsed.margins?.left), right: num(parsed.margins?.right),
      },
    };
  } catch {
    return DEFAULT_PAPER;
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && isFinite(v) ? Math.min(3, Math.max(0, v)) : 1;
}

// Pixel dimensions of the page at 100% zoom, orientation applied
export function paperPx(paper: PaperSettings): { width: number; height: number } {
  const dims = PAPER_SIZES[paper.size];
  const w = paper.orientation === 'landscape' ? dims.heightIn : dims.widthIn;
  const h = paper.orientation === 'landscape' ? dims.widthIn : dims.heightIn;
  return { width: Math.round(w * PX_PER_INCH), height: Math.round(h * PX_PER_INCH) };
}
