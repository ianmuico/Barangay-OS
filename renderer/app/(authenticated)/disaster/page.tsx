'use client';

import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { getAPI, type DisasterRecord } from '@/lib/ipc';
import { toast } from 'sonner';

const TYPES = ['hazard', 'plan', 'drill', 'incident', 'resource'];
const empty = { record_type: 'hazard', title: '', record_date: '', location: '', status: '', description: '' };

export default function DisasterPage() {
  const [items, setItems] = useState<DisasterRecord[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DisasterRecord | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => { const api = getAPI(); if (!api) return; setItems(await api.getDisaster({ search: debounced, record_type: type })); }, [debounced, type]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...empty, record_type: type === 'all' ? 'hazard' : type }); setFormOpen(true); };
  const openEdit = (d: DisasterRecord) => {
    setEditing(d);
    setForm({ record_type: d.record_type, title: d.title, record_date: d.record_date || '', location: d.location || '', status: d.status || '', description: d.description || '' });
    setFormOpen(true);
  };
  const save = async () => {
    const api = getAPI(); if (!api) return;
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    try {
      if (editing) { await api.updateDisaster(editing.id, form as any); toast.success('Record updated'); }
      else { await api.createDisaster(form as any); toast.success('Record added'); }
      setFormOpen(false); load();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
  };
  const confirmDelete = async () => { const api = getAPI(); if (!api || deleteId == null) return; await api.deleteDisaster(deleteId); toast.success('Deleted'); setDeleteId(null); load(); };

  return (
    <div className="space-y-4">
      <PageHeader title="Disaster Preparedness" description="BDRIS — hazards, plans, drills, incidents, and response resources.">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Record</Button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search records..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={type} onValueChange={setType}>
          <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="hazard">Hazards</TabsTrigger>
            <TabsTrigger value="plan">Plans</TabsTrigger><TabsTrigger value="drill">Drills</TabsTrigger>
            <TabsTrigger value="incident">Incidents</TabsTrigger><TabsTrigger value="resource">Resources</TabsTrigger></TabsList>
        </Tabs>
      </div>
      {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <LifeBuoy className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">No records yet.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Title</th><th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Date</th><th className="px-4 py-3 text-left font-medium">Location</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>{items.map((d) => (
              <tr key={d.id} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => openEdit(d)}>
                <td className="max-w-[320px] truncate px-4 py-2.5 font-medium" title={d.title}>{d.title}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] capitalize">{d.record_type}</Badge></td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.record_date || '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.location || '—'}</td>
                <td className="px-4 py-2.5 text-right"><div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit Record' : 'Add Disaster Record'}</DialogTitle>
            <DialogDescription>Disaster preparedness / response record.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Type</Label>
                <Select value={form.record_type} onValueChange={(v) => setForm({ ...form, record_type: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Date</Label>
                <Input type="date" value={form.record_date} onChange={(e) => setForm({ ...form, record_date: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Status</Label>
                <Input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
