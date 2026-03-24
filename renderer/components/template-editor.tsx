'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter,
  AlignRight, List, ListOrdered, Heading1, Heading2, Undo, Redo,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TEMPLATE_VARIABLES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface TemplateEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export function TemplateEditor({ content, onChange }: TemplateEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing your template...' }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  const insertVariable = (key: string) => {
    editor.chain().focus().insertContent(`{{${key}}}`).run();
  };

  const ToolbarButton = ({
    onClick,
    active,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title?: string;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8', active && 'bg-accent')}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border" />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border" />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border" />

        <Select onValueChange={insertVariable}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="Insert Variable" />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATE_VARIABLES.map((v) => (
              <SelectItem key={v.key} value={v.key}>
                {v.label} - {`{{${v.key}}}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none p-4 min-h-[400px] focus:outline-none [&_.ProseMirror]:min-h-[380px] [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}
