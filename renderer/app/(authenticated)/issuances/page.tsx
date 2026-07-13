'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gavel, Pencil, Plus, Printer, Search, Trash2, Eye } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAPI, type Issuance } from '@/lib/ipc';
import { toast } from 'sonner';

const TYPE_LABEL: Record<string, string> = {
  ordinance: 'Ordinance',
  resolution: 'Resolution',
  executive_order: 'Executive Order',
};

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

export default function IssuancesPage() {
  const [items, setItems] = useState<Issuance[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Issuance | null>(null);
  const [form, setForm] = useState({
    type: 'ordinance', reference_no: '', title: '', date_enacted: '', author: '', status: 'enacted', full_text: '', notes: '',
  });
  const [viewItem, setViewItem] = useState<Issuance | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    setItems(await api.getIssuances({ search: debounced, type }));
  }, [debounced, type]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ type: 'ordinance', reference_no: '', title: '', date_enacted: '', author: '', status: 'enacted', full_text: '', notes: '' });
    setFormOpen(true);
  };

  const openEdit = (it: Issuance) => {
    setEditing(it);
    setForm({
      type: it.type, reference_no: it.reference_no || '', title: it.title,
      date_enacted: it.date_enacted || '', author: it.author || '', status: it.status,
      full_text: it.full_text || '', notes: it.notes || '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    const api = getAPI();
    if (!api) return;
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    const payload = { ...form, type: form.type as Issuance['type'] };
    try {
      if (editing) { await api.updateIssuance(editing.id, payload); toast.success('Issuance updated'); }
      else { await api.createIssuance(payload); toast.success('Issuance saved'); }
      setFormOpen(false);
      load();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
  };

  const confirmDelete = async () => {
    const api = getAPI();
    if (!api || deleteId == null) return;
    await api.deleteIssuance(deleteId);
    toast.success('Issuance deleted');
    setDeleteId(null);
    load();
  };

  const buildHtml = (it: Issuance) => {
    const heading = [TYPE_LABEL[it.type] || it.type, it.reference_no].filter(Boolean).join(' No. ');
    return `{{header}}<div style="text-align:center;margin:8px 0;"><p style="font-size:10pt;font-weight:bold;">${esc(heading)}</p><h2 style="margin:8px 0;">${esc(it.title)}</h2>${it.date_enacted ? `<p style="font-size:10pt;">Enacted: ${esc(it.date_enacted)}</p>` : ''}</div><div style="white-space:pre-wrap;text-align:justify;">${esc(it.full_text || '')}</div>`;
  };

  const printItem = async (it: Issuance) => {
    const api = getAPI();
    if (!api) return;
    const r = await api.printReport(buildHtml(it));
    if (r.success) toast.success('Print dialog opened'); else toast.error(r.error || 'Print failed');
  };

  const exportItem = async (it: Issuance) => {
    const api = getAPI();
    if (!api) return;
    const r = await api.exportPDF(buildHtml(it), (it.reference_no || it.title).replace(/[^a-zA-Z0-9]+/g, '_'));
    if (r.success) toast.success('PDF saved');
    else if (r.error !== 'Save cancelled') toast.error(r.error || 'Export failed');
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Ordinances & Resolutions" description="BORIS — repository of barangay ordinances, resolutions, and executive orders.">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Issuance</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search title, number, author, text..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={type} onValueChange={setType}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="ordinance">Ordinances</TabsTrigger>
            <TabsTrigger value="resolution">Resolutions</TabsTrigger>
            <TabsTrigger value="executive_order">Executive Orders</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Gavel className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No issuances yet. Click “New Issuance” to record one.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Reference</th>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="cursor-pointer border-b transition-colors hover:bg-muted/30" onClick={() => setViewItem(it)}>
                  <td className="px-4 py-2.5 font-mono text-xs">{it.reference_no || '—'}</td>
                  <td className="max-w-[320px] truncate px-4 py-2.5 font-medium" title={it.title}>{it.title}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{TYPE_LABEL[it.type] || it.type}</Badge></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{it.date_enacted || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">{it.status}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setViewItem(it)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(it)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Print" onClick={() => printItem(it)}><Printer className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete" onClick={() => setDeleteId(it.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Issuance' : 'New Issuance'}</DialogTitle>
            <DialogDescription>Record a barangay ordinance, resolution, or executive order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ordinance">Ordinance</SelectItem>
                    <SelectItem value="resolution">Resolution</SelectItem>
                    <SelectItem value="executive_order">Executive Order</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reference No.</Label>
                <Input value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} placeholder="e.g. 2026-001" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date Enacted</Label>
                <Input type="date" value={form.date_enacted} onChange={(e) => setForm({ ...form, date_enacted: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Author / Sponsor</Label>
                <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enacted">Enacted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="amended">Amended</SelectItem>
                    <SelectItem value="repealed">Repealed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Full Text</Label>
              <Textarea rows={10} value={form.full_text} onChange={(e) => setForm({ ...form, full_text: e.target.value })} placeholder="Body of the ordinance/resolution…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={!!viewItem} onOpenChange={(o) => !o && setViewItem(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewItem && `${TYPE_LABEL[viewItem.type] || viewItem.type}${viewItem.reference_no ? ` No. ${viewItem.reference_no}` : ''}`}</DialogTitle>
            <DialogDescription>{viewItem?.title}</DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm">{viewItem?.full_text || 'No text recorded.'}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => viewItem && exportItem(viewItem)}>Save as PDF</Button>
            <Button variant="outline" onClick={() => viewItem && printItem(viewItem)}><Printer className="mr-2 h-4 w-4" />Print</Button>
            <Button onClick={() => { if (viewItem) { openEdit(viewItem); setViewItem(null); } }}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this issuance?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the record from the repository.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
