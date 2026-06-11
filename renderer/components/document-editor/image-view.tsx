'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { AlignCenter, ArrowLeftToLine, ArrowRightToLine, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const WIDTH_PRESETS = [25, 50, 75, 100];

// Editor view for images: drag anywhere by the handle, float left/right so
// text wraps around it (like Word), or center it as a block; resize via presets.
export function ImageView(props: NodeViewProps) {
  const { node, selected, updateAttributes } = props;
  const { src, alt, width, float } = node.attrs as { src: string; alt?: string; width: number | null; float: string };

  const wrapperStyle: React.CSSProperties = float === 'left'
    ? { float: 'left', margin: '4px 16px 8px 0', width: width ? `${width}%` : undefined, maxWidth: width ? undefined : '100%' }
    : float === 'right'
      ? { float: 'right', margin: '4px 0 8px 16px', width: width ? `${width}%` : undefined, maxWidth: width ? undefined : '100%' }
      : { display: 'block', margin: '8px auto', width: width ? `${width}%` : undefined, maxWidth: width ? undefined : '100%' };

  const setFloat = (value: 'none' | 'left' | 'right') => {
    // Floated images need an explicit width so text has room to wrap
    updateAttributes({ float: value, width: value !== 'none' && !width ? 50 : width });
  };

  const cycleWidth = () => {
    const current = width ?? 100;
    const idx = WIDTH_PRESETS.indexOf(current);
    const next = WIDTH_PRESETS[(idx + 1) % WIDTH_PRESETS.length];
    updateAttributes({ width: next });
  };

  return (
    <NodeViewWrapper as="div" className="group/img relative" style={wrapperStyle} data-drag-handle>
      <img
        src={src}
        alt={alt || ''}
        className={cn('h-auto w-full rounded-sm', selected && 'outline outline-2 outline-blue-500')}
        draggable={false}
      />

      {/* Controls — visible when selected or hovered */}
      <div
        className={cn(
          'absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-md transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover/img:opacity-100',
        )}
        contentEditable={false}
      >
        <span className="cursor-grab px-0.5 text-muted-foreground" title="Drag to move anywhere in the document" data-drag-handle>
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          title="Float left — text wraps on the right"
          onClick={() => setFloat('left')}
          className={cn('rounded p-1 hover:bg-accent', float === 'left' && 'bg-accent')}
        >
          <ArrowLeftToLine className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Center — text above and below"
          onClick={() => setFloat('none')}
          className={cn('rounded p-1 hover:bg-accent', float === 'none' && 'bg-accent')}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Float right — text wraps on the left"
          onClick={() => setFloat('right')}
          className={cn('rounded p-1 hover:bg-accent', float === 'right' && 'bg-accent')}
        >
          <ArrowRightToLine className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Resize (25% → 50% → 75% → 100%)"
          onClick={cycleWidth}
          className="rounded px-1.5 py-1 font-sans text-[10px] font-semibold hover:bg-accent"
        >
          {width ?? 100}%
        </button>
      </div>
    </NodeViewWrapper>
  );
}
