'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Eye, FileDown, FolderOpen, Pencil, Printer, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAPI, type DocumentListItem } from '@/lib/ipc';
import { PaperPreview } from '@/components/paper-preview';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

function sizeLabel(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// The barangay's file cabinet: every generated and custom document, searchable,
// reviewable, re-editable and reprintable — even years later.
export default function DocumentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [result, setResult] = useState<{ data: DocumentListItem[]; total: number; page: number; totalPages: number } | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState<'all' | 'resident' | 'case' | 'business'>('all');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ id: number; title: string; html: string } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debounced, type]);

  const fetchDocs = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    setResult(await api.listDocuments({ search: debounced, type, page, limit: 25 }));
  }, [debounced, type, page]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const openPreview = async (d: DocumentListItem) => {
    const api = getAPI();
    if (!api) return;
    const doc = await api.getDocument(d.id);
    if (!doc) { toast.error('Document not found'); return; }
    setPreview({ id: d.id, title: docTitle(d), html: doc.content_html });
  };

  const docTitle = (d: DocumentListItem) =>
    d.title || d.template_name || 'Document';

  const handlePrint = async (id: number) => {
    const api = getAPI();
    if (!api) return;
    setBusy(true);
    try {
      const doc = await api.getDocument(id);
      if (!doc) return;
      const r = await api.printReport(doc.content_html);
      if (r.success) toast.success('Print dialog opened');
      else toast.error(r.error || 'Print failed');
    } finally { setBusy(false); }
  };

  const handleExport = async (d: DocumentListItem) => {
    const api = getAPI();
    if (!api) return;
    setBusy(true);
    try {
      const doc = await api.getDocument(d.id);
      if (!doc) return;
      const r = await api.exportPDF(doc.content_html, docTitle(d).replace(/[^a-zA-Z0-9]+/g, '_'));
      if (r.success) toast.success('PDF saved');
      else if (r.error !== 'Save cancelled') toast.error(r.error || 'Export failed');
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const api = getAPI();
    if (!api) return;
    try {
      await api.deleteDocument(deleteId);
      toast.success('Document deleted');
      fetchDocs();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Saved Documents" description="Every generated certificate and custom document — search, reopen, edit, and reprint anytime." />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by title, resident, business, or case number..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={type} onValueChange={(v) => setType(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="resident">Residents</TabsTrigger>
            <TabsTrigger value="case">Cases</TabsTrigger>
            <TabsTrigger value="business">Businesses</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!result ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading documents...</CardContent></Card>
      ) : result.data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {debounced ? 'No documents match your search.' : 'No saved documents yet. Documents are saved automatically when generated, printed, or saved from the page editor.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Document</th>
                  <th className="px-4 py-3 text-left font-medium">Linked To</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Size</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((d) => (
                  <tr key={d.id} className="cursor-pointer border-b transition-colors hover:bg-muted/30" onClick={() => openPreview(d)}>
                    <td className="max-w-[280px] truncate px-4 py-2.5 font-medium" title={docTitle(d)}>{docTitle(d)}</td>
                    <td className="px-4 py-2.5">
                      {d.business_name ? (
                        <Badge variant="outline" className="text-[10px]">🏪 {d.business_name}</Badge>
                      ) : d.case_number ? (
                        <Badge variant="outline" className="text-[10px]">Case {d.case_number}</Badge>
                      ) : d.resident_name ? (
                        <span className="text-muted-foreground">{d.resident_name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{new Date(d.generated_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{sizeLabel(d.size_bytes)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => openPreview(d)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit in page editor" onClick={() => router.push(`/documents/editor?reportId=${d.id}`)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Print" disabled={busy} onClick={() => handlePrint(d.id)}><Printer className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Save as PDF" disabled={busy} onClick={() => handleExport(d)}><FileDown className="h-4 w-4" /></Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete" onClick={() => setDeleteId(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{result.total.toLocaleString()} document{result.total === 1 ? '' : 's'}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button>
              <span className="text-sm text-muted-foreground">Page {result.page} of {result.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= result.totalPages} onClick={() => setPage(page + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}

      {/* Preview */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
            <DialogDescription>Saved document — view, edit, print, or export.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto rounded-md bg-neutral-200 p-6 dark:bg-neutral-900">
            {preview && <PaperPreview html={preview.html} />}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
            <Button variant="outline" onClick={() => preview && router.push(`/documents/editor?reportId=${preview.id}`)}>
              <Pencil className="mr-2 h-4 w-4" />Edit
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => preview && handlePrint(preview.id)}>
              <Printer className="mr-2 h-4 w-4" />Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the saved document copy. The resident and case records it belongs to are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
