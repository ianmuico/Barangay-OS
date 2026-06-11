'use client';

import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Undo, Redo, Highlighter,
  Indent, Outdent, Table as TableIcon, ImageIcon, Minus, Superscript as SuperIcon,
  Subscript as SubIcon, FileOutput, Baseline, TextQuote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const FONT_FAMILIES = [
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
];

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36'];
const LINE_HEIGHTS = [
  { label: 'Single', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Double', value: '2' },
];
const HIGHLIGHT_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa'];

function ToolbarButton({ onClick, active, disabled, children, title }: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      className={cn('h-8 w-8', active && 'bg-accent')}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const currentFontSize = (editor.getAttributes('textStyle').fontSize || '12pt').replace('pt', '');
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || FONT_FAMILIES[0].value;
  const blockType = editor.isActive('heading', { level: 1 }) ? 'h1'
    : editor.isActive('heading', { level: 2 }) ? 'h2'
    : editor.isActive('heading', { level: 3 }) ? 'h3'
    : 'p';

  const setBlockType = (value: string) => {
    const chain = editor.chain().focus();
    if (value === 'p') chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(value.replace('h', '')) as 1 | 2 | 3 }).run();
  };

  const setLineHeight = (value: string) => {
    const type = editor.isActive('heading') ? 'heading' : 'paragraph';
    editor.chain().focus().updateAttributes(type, { lineHeight: value }).run();
  };

  const changeIndent = (delta: 1 | -1) => {
    const chain = editor.chain().focus();
    if (editor.isActive('listItem')) {
      if (delta === 1) chain.sinkListItem('listItem').run();
      else chain.liftListItem('listItem').run();
      return;
    }
    const type = editor.isActive('heading') ? 'heading' : 'paragraph';
    const current = editor.getAttributes(type).indent || 0;
    chain.updateAttributes(type, { indent: Math.max(0, Math.min(8, current + delta)) }).run();
  };

  const toggleFirstLineIndent = () => {
    const type = editor.isActive('heading') ? 'heading' : 'paragraph';
    const current = !!editor.getAttributes(type).textIndent;
    editor.chain().focus().updateAttributes(type, { textIndent: !current }).run();
  };

  const handleImageFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image too large — keep it under 2 MB so documents stay fast to print.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-background p-1.5">
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo" disabled={!editor.can().undo()}>
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo" disabled={!editor.can().redo()}>
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      <Select value={blockType} onValueChange={setBlockType}>
        <SelectTrigger className="h-8 w-[116px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="p">Normal</SelectItem>
          <SelectItem value="h1">Title</SelectItem>
          <SelectItem value="h2">Heading</SelectItem>
          <SelectItem value="h3">Subheading</SelectItem>
        </SelectContent>
      </Select>

      <Select value={currentFontFamily} onValueChange={(v) => editor.chain().focus().setFontFamily(v).run()}>
        <SelectTrigger className="h-8 w-[152px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={FONT_SIZES.includes(currentFontSize) ? currentFontSize : '12'} onValueChange={(v) => editor.chain().focus().setMark('textStyle', { fontSize: `${v}pt` }).run()}>
        <SelectTrigger className="h-8 w-[60px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
        </SelectContent>
      </Select>

      <Divider />

      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="Superscript">
        <SuperIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="Subscript">
        <SubIcon className="h-4 w-4" />
      </ToolbarButton>

      {/* Text color */}
      <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent" title="Text Color">
        <Baseline className="h-4 w-4" style={{ color: editor.getAttributes('textStyle').color || undefined }} />
        <input
          type="color"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={editor.getAttributes('textStyle').color || '#000000'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>

      {/* Highlight */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', editor.isActive('highlight') && 'bg-accent')} title="Highlight">
            <Highlighter className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <div className="flex gap-1 p-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="h-6 w-6 rounded border"
                style={{ background: c }}
                onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
              />
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor.chain().focus().unsetHighlight().run()}>Remove highlight</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />

      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => changeIndent(-1)} title="Decrease Indent">
        <Outdent className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => changeIndent(1)} title="Increase Indent">
        <Indent className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={toggleFirstLineIndent} active={!!editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph').textIndent} title="First-line Indent (paragraph style used in certificates)">
        <TextQuote className="h-4 w-4" />
      </ToolbarButton>

      {/* Line spacing */}
      <Select onValueChange={setLineHeight}>
        <SelectTrigger className="h-8 w-[104px] text-xs"><SelectValue placeholder="Spacing" /></SelectTrigger>
        <SelectContent>
          {LINE_HEIGHTS.map((lh) => (<SelectItem key={lh.value} value={lh.value}>{lh.label}</SelectItem>))}
        </SelectContent>
      </Select>

      <Divider />

      {/* Table */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', editor.isActive('table') && 'bg-accent')} title="Table">
            <TableIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            Insert table (3 × 3)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().addRowAfter().run()}>Add row below</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().addColumnAfter().run()}>Add column right</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().deleteColumn().run()}>Delete column</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Toggle header row</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().updateAttributes('table', { borderless: true }).run()}>
            Hide all table borders
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().updateAttributes('table', { borderless: false }).run()}>
            Show all table borders
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().setCellAttribute('noBorder', true).run()}>
            Hide borders — selected cells
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().setCellAttribute('noBorder', false).run()}>
            Show borders — selected cells
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!editor.isActive('table')} className="text-destructive" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Image */}
      <ToolbarButton onClick={() => imageInputRef.current?.click()} title="Insert Image">
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageFile(file);
          e.target.value = '';
        }}
      />

      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Line">
        <Minus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()} title="Page Break — content after this starts on a new page">
        <FileOutput className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
