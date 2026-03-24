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
import { TEMPLATE_VARIABLES, TEMPLATE_SPECIAL_TAGS } from '@/lib/constants';
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

  const insertSpecialTag = (key: string) => {
    if (key === 'header') {
      editor.chain().focus().insertContent('{{header}}').run();
    } else if (key === 'input') {
      const fieldName = window.prompt('Enter the input field name (e.g., "purpose", "amount"):');
      if (fieldName && fieldName.trim()) {
        editor.chain().focus().insertContent(`{{input:${fieldName.trim()}}}`).run();
      }
    } else if (key === 'signatory') {
      const role = window.prompt('Enter the signatory role (e.g., "punong_barangay", "secretary", "treasurer"):');
      if (role && role.trim()) {
        editor.chain().focus().insertContent(`{{signatory:${role.trim()}}}`).run();
      }
    }
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

        <Select onValueChange={insertSpecialTag}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="Special Tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="header">
              Barangay Header (letterhead)
            </SelectItem>
            <SelectItem value="input">
              Custom Input Field
            </SelectItem>
            <SelectItem value="signatory">
              Signatory
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* A4 paper-like editor area */}
      <div className="bg-muted/40 p-6 overflow-auto">
        <EditorContent
          editor={editor}
          className={cn(
            'mx-auto max-w-[700px] min-h-[600px] bg-white text-black rounded shadow-md',
            '[&_.ProseMirror]:min-h-[600px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:p-[60px]',
            '[&_.ProseMirror]:font-serif [&_.ProseMirror]:text-[12pt] [&_.ProseMirror]:leading-[1.6]',
            '[&_.ProseMirror_h1]:font-serif [&_.ProseMirror_h2]:font-serif',
            '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400',
          )}
          style={{
            fontFamily: "'Times New Roman', serif",
          }}
        />
      </div>
    </div>
  );
}
