'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAPI, type Institution } from '@/lib/ipc';
import { toast } from 'sonner';

const TYPES = ['SK', 'BHW', 'BNS', 'Tanod', 'Lupon', 'Committee', 'NGO', 'Cooperative', 'Association', 'Other'];
const empty = { name: '', type: '', head_name: '', contact: '', members_count: '', description: '' };

export default function InstitutionsPage() {
  const [items, setItems] = useState<Institution[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Institution | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => { const api = getAPI(); if (!api) return; setItems(await api.getInstitutions({ search: debounced })); }, [debounced]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setFormOpen(true); };
  const openEdit = (i: Institution) => {
    setEditing(i);
    setForm({ name: i.name, type: i.type || '', head_name: i.head_name || '', contact: i.contact || '', members_count: i.members_count != null ? String(i.members_count) : '', description: i.description || '' });
    setFormOpen(true);
  };
  const save = async () => {
    const api = getAPI(); if (!api) return;
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const payload = { ...form, members_count: form.members_count ? Number(form.members_count) : null };
    try {
      if (editing) { await api.updateInstitution(editing.id, payload as any); toast.success('Institution updated'); }
      else { await api.createInstitution(payload as any); toast.success('Institution added'); }
      setFormOpen(false); load();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
  };
  const confirmDelete = async () => { const api = getAPI(); if (!api || deleteId == null) return; await api.deleteInstitution(deleteId); toast.success('Deleted'); setDeleteId(null); load(); };

  return (
    <div className="space-y-4">
      <PageHeader title="Barangay-Based Institutions" description="BBI — SK, BHW/BNS, Tanod, Lupon, committees, cooperatives, and other organizations.">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Institution</Button>
      </PageHeader>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search institutions..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Users2 className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">No institutions yet.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th><th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Head</th><th className="px-4 py-3 text-left font-medium">Members</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.id} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => openEdit(i)}>
                <td className="px-4 py-2.5 font-medium">{i.name}</td>
                <td className="px-4 py-2.5">{i.type ? <Badge variant="outline" className="text-[10px]">{i.type}</Badge> : '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{i.head_name || '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{i.members_count ?? '—'}</td>
                <td className="px-4 py-2.5 text-right"><div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(i.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Institution' : 'Add Institution'}</DialogTitle>
            <DialogDescription>Barangay-based institution / organization record.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Members</Label>
                <Input type="number" value={form.members_count} onChange={(e) => setForm({ ...form, members_count: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Head / Leader</Label>
                <Input value={form.head_name} onChange={(e) => setForm({ ...form, head_name: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Contact</Label>
                <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this institution?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
