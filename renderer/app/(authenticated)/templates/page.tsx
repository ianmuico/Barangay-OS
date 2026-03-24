'use client';

import { useEffect, useState } from 'react';
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
import { toast } from 'sonner';

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
  // ─── Report Templates ───
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ReportTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ReportTemplate | null>(null);
  const [name, setName] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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

  // ─── Report Template handlers ───
  const openNew = () => { setEditTemplate(null); setName(''); setContentHtml(''); setEditOpen(true); };
  const openEdit = (t: ReportTemplate) => { setEditTemplate(t); setName(t.name); setContentHtml(t.content_html); setEditOpen(true); };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return; }
    const api = getAPI();
    if (!api) return;
    setSaving(true);
    try {
      const variableRegex = /\{\{(\w+)\}\}/g;
      const usedVars: string[] = [];
      let match;
      while ((match = variableRegex.exec(contentHtml)) !== null) {
        if (!usedVars.includes(match[1])) usedVars.push(match[1]);
      }
      const data = { name: name.trim(), content_html: contentHtml, variables_json: JSON.stringify(usedVars) };
      if (editTemplate) { await api.updateTemplate(editTemplate.id, data); toast.success('Template updated'); }
      else { await api.createTemplate(data); toast.success('Template created'); }
      setEditOpen(false);
      fetchTemplates();
    } finally { setSaving(false); }
  };

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
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">No templates yet. Create your first template.</p>
                <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Create Template</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => {
                const vars = t.variables_json ? JSON.parse(t.variables_json) : [];
                const previewText = stripHtml(t.content_html).slice(0, 120);
                return (
                  <Card key={t.id} className="group relative overflow-hidden">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{t.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">Created: {new Date(t.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setPreviewTemplate(t)} title="Preview"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-3 rounded border bg-white dark:bg-zinc-900 p-3 text-xs text-muted-foreground leading-relaxed h-20 overflow-hidden relative">
                        <p className="line-clamp-4">{previewText || 'Empty template'}</p>
                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white dark:from-zinc-900 to-transparent" />
                      </div>
                      {vars.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {vars.slice(0, 5).map((v: string) => (<Badge key={v} variant="outline" className="text-[10px] px-1.5 py-0">{`{{${v}}}`}</Badge>))}
                          {vars.length > 5 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{vars.length - 5}</Badge>}
                        </div>
                      )}
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
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
            <DialogDescription>Variables will be replaced with resident data when generating.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-white p-8 text-black min-h-[400px]" style={{ fontFamily: "'Times New Roman', serif", fontSize: '12pt', lineHeight: 1.6 }}>
            {previewTemplate && <div dangerouslySetInnerHTML={{ __html: previewTemplate.content_html }} />}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Report Template Edit ═══ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
            <DialogDescription>Use the editor to create your template. Insert variables to auto-fill resident data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Barangay Clearance" />
            </div>
            <TemplateEditor key={editTemplate?.id || 'new'} content={contentHtml} onChange={setContentHtml} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Template'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ List Header Preview ═══ */}
      <Dialog open={!!previewHeader} onOpenChange={() => setPreviewHeader(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {previewHeader?.name}</DialogTitle>
            <DialogDescription>This header appears at the top of printed resident lists.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-white p-8 text-black min-h-[200px]" style={{ fontFamily: "'Times New Roman', serif", fontSize: '12pt', lineHeight: 1.6 }}>
            {previewHeader && <div dangerouslySetInnerHTML={{ __html: previewHeader.content_html }} />}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPreviewHeader(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ List Header Edit ═══ */}
      <Dialog open={headerEditOpen} onOpenChange={setHeaderEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
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
