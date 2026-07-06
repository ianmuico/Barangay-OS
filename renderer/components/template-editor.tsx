'use client';

import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter,
  AlignRight, List, ListOrdered, Heading1, Heading2, Undo, Redo,
  Sparkles, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { TEMPLATE_VARIABLES, TEMPLATE_SPECIAL_TAGS } from '@/lib/constants';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';
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

  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getSetting('ai_enabled').then((v) => setAiEnabled(v === '1'));
    // If local AI starts lagging the machine, the backend auto-disables it and
    // fires this — hide the button and close the dialog immediately.
    const unsubscribe = api.onAIAutoDisabled(() => {
      setAiEnabled(false);
      setAiOpen(false);
    });
    return unsubscribe;
  }, []);

  if (!editor) return null;

  const runAI = async (mode: 'generate' | 'improve') => {
    const api = getAPI();
    if (!api) return;
    const instruction = aiInstruction.trim();
    if (!instruction) { toast.error('Describe what you want first'); return; }
    const variables = TEMPLATE_VARIABLES.map((v) => ({ key: v.key, label: v.label }));
    setAiBusy(true);
    try {
      const res = mode === 'improve'
        ? await api.aiImproveTemplate({ instruction, currentHtml: editor.getHTML(), variables })
        : await api.aiGenerateTemplate({ instruction, variables });
      if (res.success && res.html) {
        editor.commands.setContent(res.html);
        onChange(res.html);
        setAiOpen(false);
        setAiInstruction('');
        toast.success(mode === 'improve' ? 'Template updated — review before saving' : 'Draft inserted — review before saving');
      } else {
        toast.error(res.error || 'AI request failed');
      }
    } finally {
      setAiBusy(false);
    }
  };

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
      {/* Toolbar */}
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

        {aiEnabled && (
          <>
            <div className="mx-1 h-6 w-px bg-border" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-violet-600 hover:text-violet-700"
              onClick={() => setAiOpen(true)}
              title="Draft this template with AI"
            >
              <Sparkles className="h-4 w-4" /> AI Draft
            </Button>
          </>
        )}
      </div>

      {/* A4 paper editor area */}
      <div className="bg-neutral-100 dark:bg-neutral-900 p-8 overflow-auto max-h-[70vh]">
        <div className="mx-auto" style={{ width: '794px' }}>
          <EditorContent
            editor={editor}
            className={cn(
              'bg-white border border-neutral-300 shadow-sm',
              '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[1123px]',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400',
            )}
            style={{
              padding: '96px 72px',
              fontFamily: "'Times New Roman', Times, serif",
              fontSize: '12pt',
              lineHeight: 1.6,
              color: '#000',
            }}
          />
        </div>
      </div>

      {/* AI draft dialog */}
      <Dialog open={aiOpen} onOpenChange={(o) => { if (!aiBusy) setAiOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" /> AI template draft
            </DialogTitle>
            <DialogDescription>
              Describe the document in plain language. The AI writes the template with the correct
              placeholders — no resident data is sent. Review the result before saving.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            placeholder={'e.g. "a certificate of indigency for a hospital bill, with the patient name as an input field"'}
            rows={4}
            disabled={aiBusy}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => runAI('improve')} disabled={aiBusy}>
              {aiBusy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Improve current
            </Button>
            <Button onClick={() => runAI('generate')} disabled={aiBusy}>
              {aiBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              Generate (replaces all)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
