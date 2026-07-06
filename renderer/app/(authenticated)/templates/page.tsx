'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Eye, List } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TemplateEditor } from '@/components/template-editor';
import { getAPI, type ReportTemplate } from '@/lib/ipc';
import { parsePaperJson } from '@/lib/paper';
import { PaperPreview } from '@/components/paper-preview';
import { TemplateThumbnail } from '@/components/template-thumbnail';
import { type PreviewContext } from '@/components/document-editor/serialize';
import { type Official } from '@/lib/ipc';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { useTranslation } from 'react-i18next';

interface ListHeader {
  id: string;
  name: string;
  content_html: string;
}

function stripHtml(html: string): string {
  const tmp = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (tmp) { tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; }
  return html.replace(/<[^>]*>/g, '');
}

export default function TemplatesPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();

  // ─── Report Templates ───
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<ReportTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewCtx, setPreviewCtx] = useState<PreviewContext | null>(null);

  // ─── List Header Templates ───
  const [listHeaders, setListHeaders] = useState<ListHeader[]>([]);
  const [headerEditOpen, setHeaderEditOpen] = useState(false);
  const [editingHeader, setEditingHeader] = useState<ListHeader | null>(null);
  const [headerName, setHeaderName] = useState('');
  const [headerContentHtml, setHeaderContentHtml] = useState('');
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerDeleteId, setHeaderDeleteId] = useState<string | null>(null);
  const [previewHeader, setPreviewHeader] = useState<ListHeader | null>(null);

  // ─── Fetch ───
  const fetchTemplates = async () => {
    const api = getAPI();
    if (!api) return;
    setTemplates(await api.getTemplates());
  };

  const fetchListHeaders = async () => {
    const api = getAPI();
    if (!api) return;
    const raw = await api.getSetting('list_header_templates');
    if (raw) {
      try { setListHeaders(JSON.parse(raw)); } catch { setListHeaders([]); }
    }
  };

  const saveListHeaders = async (headers: ListHeader[]) => {
    const api = getAPI();
    if (!api) return;
    await api.setSetting('list_header_templates', JSON.stringify(headers));
    setListHeaders(headers);
  };

  useEffect(() => { fetchTemplates(); fetchListHeaders(); }, []);

  // Load the preview context once so every card thumbnail renders the real
  // letterhead + sample data without N× IPC calls.
  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    (async () => {
      const [barangay, barangayAddress, municipality, province, headerTemplate, logo, officials] = await Promise.all([
        api.getSetting('barangay_name'), api.getSetting('barangay_address'),
        api.getSetting('municipality'), api.getSetting('province'),
        api.getSetting('header_template'), api.getLogoBase64(),
        api.getOfficials().then((l: Official[]) => l.filter(o => o.is_active)).catch(() => [] as Official[]),
      ]);
      setPreviewCtx({
        barangay: barangay || '', barangayAddress: barangayAddress || '',
        municipality: municipality || '', province: province || '',
        headerTemplate: headerTemplate || null, logoDataUrl: logo, officials,
      });
    })();
  }, []);

  // Handle ?edit=<id> from generator page — opens the full document editor
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId) {
      router.replace(`/templates/editor?id=${editId}`, { scroll: false });
    }
  }, [searchParams, router]);

  // ─── Report Template handlers ───
  const openNew = () => router.push('/templates/editor');
  const openEdit = (t: ReportTemplate) => router.push(`/templates/editor?id=${t.id}`);

  const handleDelete = async () => {
    if (!deleteId) return;
    const api = getAPI();
    if (!api) return;
    await api.deleteTemplate(deleteId);
    toast.success('Template deleted');
    setDeleteId(null);
    fetchTemplates();
  };

  // ─── List Header handlers ───
  const openNewHeader = () => { setEditingHeader(null); setHeaderName(''); setHeaderContentHtml(''); setHeaderEditOpen(true); };
  const openEditHeader = (h: ListHeader) => { setEditingHeader(h); setHeaderName(h.name); setHeaderContentHtml(h.content_html); setHeaderEditOpen(true); };

  const handleSaveHeader = async () => {
    if (!headerName.trim()) { toast.error('Header name is required'); return; }
    setHeaderSaving(true);
    try {
      let updated: ListHeader[];
      if (editingHeader) {
        updated = listHeaders.map(h => h.id === editingHeader.id ? { ...h, name: headerName.trim(), content_html: headerContentHtml } : h);
      } else {
        const newHeader: ListHeader = { id: `lh_${Date.now()}`, name: headerName.trim(), content_html: headerContentHtml };
        updated = [...listHeaders, newHeader];
      }
      await saveListHeaders(updated);
      setHeaderEditOpen(false);
      toast.success(editingHeader ? 'Header updated' : 'Header created');
    } finally { setHeaderSaving(false); }
  };

  const handleDeleteHeader = async () => {
    if (!headerDeleteId) return;
    const updated = listHeaders.filter(h => h.id !== headerDeleteId);
    await saveListHeaders(updated);
    setHeaderDeleteId(null);
    toast.success('Header deleted');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Templates" description="Manage report templates and list header templates." />

      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">Report Templates</TabsTrigger>
          <TabsTrigger value="list-headers">List Headers</TabsTrigger>
        </TabsList>

        {/* ═══ Report Templates Tab ═══ */}
        <TabsContent value="reports" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />New Template</Button>
          </div>

          {templates.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  illustration="templates"
                  title={t('empty.templatesTitle')}
                  message={t('empty.templatesMessage')}
                  primaryAction={{
                    label: t('empty.templatesCta'),
                    onClick: openNew,
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => {
                return (
                  <Card key={t.id} className="group relative overflow-hidden">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{t.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {parsePaperJson(t.paper_json).size === 'Long' ? 'Long 8.5×13' : parsePaperJson(t.paper_json).size}
                          {' · '}Created: {new Date(t.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setPreviewTemplate(t)} title="Preview"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="block w-full text-left"
                        title="Edit template"
                      >
                        <TemplateThumbnail html={t.content_html} paper={parsePaperJson(t.paper_json)} ctx={previewCtx} />
                      </button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ List Headers Tab ═══ */}
        <TabsContent value="list-headers" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Header templates used when printing resident lists. These appear at the top of every page.</p>
            <Button onClick={openNewHeader}><Plus className="mr-2 h-4 w-4" />New Header</Button>
          </div>

          {listHeaders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <List className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground mb-4">No list headers yet. The default header with your barangay info will be used.</p>
                <Button onClick={openNewHeader}><Plus className="mr-2 h-4 w-4" />Create Header</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {listHeaders.map((h) => {
                const previewText = stripHtml(h.content_html).slice(0, 100);
                return (
                  <Card key={h.id}>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <CardTitle className="text-base truncate">{h.name}</CardTitle>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setPreviewHeader(h)} title="Preview"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditHeader(h)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setHeaderDeleteId(h.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded border bg-white dark:bg-zinc-900 p-3 text-xs text-muted-foreground leading-relaxed h-16 overflow-hidden relative">
                        <p className="line-clamp-3">{previewText || 'Empty header'}</p>
                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white dark:from-zinc-900 to-transparent" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ Report Template Preview ═══ */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
            <DialogDescription>Variables will be replaced with resident data when generating.</DialogDescription>
          </DialogHeader>
          <div className="bg-neutral-200 dark:bg-neutral-900 p-6 rounded-md overflow-auto max-h-[70vh]">
            {previewTemplate && (
              <PaperPreview html={previewTemplate.content_html} paper={parsePaperJson(previewTemplate.paper_json)} />
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ List Header Preview ═══ */}
      <Dialog open={!!previewHeader} onOpenChange={() => setPreviewHeader(null)}>
        <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {previewHeader?.name}</DialogTitle>
            <DialogDescription>This header appears at the top of printed resident lists.</DialogDescription>
          </DialogHeader>
          <div className="bg-neutral-100 dark:bg-neutral-900 p-6 rounded-md overflow-auto max-h-[60vh]">
            <div className="mx-auto bg-white text-black border border-neutral-300 shadow-sm" style={{ width: '794px', minHeight: '300px', padding: '96px 72px', fontFamily: "'Times New Roman', Times, serif", fontSize: '12pt', lineHeight: 1.6 }}>
              {previewHeader && <div dangerouslySetInnerHTML={{ __html: previewHeader.content_html }} />}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPreviewHeader(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ List Header Edit ═══ */}
      <Dialog open={headerEditOpen} onOpenChange={setHeaderEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-[1050px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingHeader ? 'Edit List Header' : 'New List Header'}</DialogTitle>
            <DialogDescription>Design the header that appears at the top of printed resident lists.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Header Name</Label>
              <Input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="e.g., Official Resident List Header" />
            </div>
            <TemplateEditor key={editingHeader?.id || 'new-header'} content={headerContentHtml} onChange={setHeaderContentHtml} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeaderEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveHeader} disabled={headerSaving}>{headerSaving ? 'Saving...' : 'Save Header'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Delete Dialogs ═══ */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this template.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={headerDeleteId !== null} onOpenChange={() => setHeaderDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List Header</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this header template.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHeader} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
