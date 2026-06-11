'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, LayoutGrid, Pencil, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TEMPLATE_PAGES } from '@/lib/constants';
import { toast } from 'sonner';
import { getAPI, type Official, type PaperSettings } from '@/lib/ipc';
import { DEFAULT_PAPER, PAPER_SIZES, parsePaperJson } from '@/lib/paper';
import { DocumentEditor } from '@/components/document-editor/document-editor';
import { PaperSetupDialog } from '@/components/document-editor/paper-setup-dialog';
import { tagsToChips, chipsToTags, resolvePreviewHtml, type PreviewContext } from '@/components/document-editor/serialize';

function TemplateEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('id') ? Number(searchParams.get('id')) : null;

  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [paper, setPaper] = useState<PaperSettings>(DEFAULT_PAPER);
  const [paperOpen, setPaperOpen] = useState(false);
  // null = template shows on every page; otherwise only on the listed pages
  const [pages, setPages] = useState<string[] | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    (async () => {
      if (templateId) {
        const tpl = await api.getTemplate(templateId);
        if (!tpl) {
          toast.error('Template not found');
          router.push('/templates');
          return;
        }
        setName(tpl.name);
        const chips = tagsToChips(tpl.content_html);
        setInitialContent(chips);
        setEditorHtml(chips);
        setPaper(parsePaperJson(tpl.paper_json));
        try {
          const parsed = tpl.pages_json ? JSON.parse(tpl.pages_json) : null;
          setPages(Array.isArray(parsed) && parsed.length ? parsed : null);
        } catch { setPages(null); }
      }
      setLoaded(true);
    })();
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePreview = async () => {
    if (previewHtml) {
      setPreviewHtml(null);
      return;
    }
    const api = getAPI();
    if (!api) return;
    const [barangay, barangayAddress, municipality, province, headerTemplate, logo, officials] = await Promise.all([
      api.getSetting('barangay_name'),
      api.getSetting('barangay_address'),
      api.getSetting('municipality'),
      api.getSetting('province'),
      api.getSetting('header_template'),
      api.getLogoBase64(),
      api.getOfficials().then((list: Official[]) => list.filter(o => o.is_active)).catch(() => [] as Official[]),
    ]);
    const ctx: PreviewContext = {
      barangay: barangay || '',
      barangayAddress: barangayAddress || '',
      municipality: municipality || '',
      province: province || '',
      headerTemplate: headerTemplate || null,
      logoDataUrl: logo,
      officials,
    };
    setPreviewHtml(resolvePreviewHtml(chipsToTags(editorHtml), ctx));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }
    const api = getAPI();
    if (!api) return;
    setSaving(true);
    try {
      const taggedHtml = chipsToTags(editorHtml);
      const variableRegex = /\{\{(\w+)\}\}/g;
      const usedVars: string[] = [];
      let match;
      while ((match = variableRegex.exec(taggedHtml)) !== null) {
        if (!usedVars.includes(match[1])) usedVars.push(match[1]);
      }
      const data = {
        name: name.trim(),
        content_html: taggedHtml,
        variables_json: JSON.stringify(usedVars),
        paper_json: JSON.stringify(paper),
        pages_json: pages && pages.length ? JSON.stringify(pages) : null,
      };
      if (templateId) {
        await api.updateTemplate(templateId, data);
        toast.success('Template updated');
      } else {
        await api.createTemplate(data);
        toast.success('Template created');
      }
      router.push('/templates');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading template...</div>;
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.push('/templates')} title="Back to templates">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name (e.g., Barangay Clearance)"
          className="h-9 w-72 font-medium"
        />
        <Button variant="outline" size="sm" onClick={() => setPaperOpen(true)}>
          <Settings2 className="mr-2 h-4 w-4" />
          {PAPER_SIZES[paper.size].label.split(' (')[0]} · {paper.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <LayoutGrid className="mr-2 h-4 w-4" />
              {pages === null ? 'Shows: All pages' : `Shows: ${pages.length} page${pages.length === 1 ? '' : 's'}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <p className="mb-3 text-sm font-medium">Where this template appears</p>
            <div className="border-b pb-3">
              <ToggleChip
                checked={pages === null}
                onCheckedChange={(checked) => setPages(checked ? null : TEMPLATE_PAGES.map(pg => pg.key))}
              >
                All pages & features
              </ToggleChip>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TEMPLATE_PAGES.map((pg) => (
                <ToggleChip
                  key={pg.key}
                  disabled={pages === null}
                  checked={pages === null ? true : pages.includes(pg.key)}
                  onCheckedChange={(checked) => {
                    setPages(prev => {
                      const current = prev ?? TEMPLATE_PAGES.map(x => x.key);
                      return checked
                        ? Array.from(new Set([...current, pg.key]))
                        : current.filter(k => k !== pg.key);
                    });
                  }}
                  className="px-2.5 py-1 text-xs"
                >
                  {pg.label}
                </ToggleChip>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Turn off "All pages" to choose specific pages — e.g. a burial certificate only on the Deceased page.
            </p>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={togglePreview}>
            {previewHtml ? (<><Pencil className="mr-2 h-4 w-4" />Back to Editing</>) : (<><Eye className="mr-2 h-4 w-4" />Preview with Sample Data</>)}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>

      <DocumentEditor
        content={initialContent}
        onChange={setEditorHtml}
        paper={paper}
        previewHtml={previewHtml}
        onEditLetterhead={() => router.push('/settings/barangay')}
      />

      <PaperSetupDialog open={paperOpen} onOpenChange={setPaperOpen} paper={paper} onChange={setPaper} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
      <TemplateEditorPage />
    </Suspense>
  );
}
