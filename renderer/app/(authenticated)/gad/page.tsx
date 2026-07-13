'use client';

import { useCallback, useEffect, useState } from 'react';
import { HeartHandshake, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { getAPI, type GadEntry } from '@/lib/ipc';
import { toast } from 'sonner';

const STATUSES = ['planned', 'ongoing', 'completed'];
const peso = (n: number | null) => n == null ? '—' : `₱${Number(n).toLocaleString('en-PH')}`;
const empty = { fiscal_year: '2026', program: '', activity: '', budget_amount: '', gad_amount: '', status: 'planned', accomplishment: '', notes: '' };

export default function GadPage() {
  const [items, setItems] = useState<GadEntry[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GadEntry | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => { const api = getAPI(); if (!api) return; setItems(await api.getGad({ search: debounced })); }, [debounced]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setFormOpen(true); };
  const openEdit = (g: GadEntry) => {
    setEditing(g);
    setForm({ fiscal_year: g.fiscal_year != null ? String(g.fiscal_year) : '', program: g.program, activity: g.activity || '', budget_amount: g.budget_amount != null ? String(g.budget_amount) : '', gad_amount: g.gad_amount != null ? String(g.gad_amount) : '', status: g.status, accomplishment: g.accomplishment || '', notes: g.notes || '' });
    setFormOpen(true);
  };
  const save = async () => {
    const api = getAPI(); if (!api) return;
    if (!form.program.trim()) { toast.error('Program is required'); return; }
    const payload = { ...form, fiscal_year: form.fiscal_year ? Number(form.fiscal_year) : null, budget_amount: form.budget_amount ? Number(form.budget_amount) : null, gad_amount: form.gad_amount ? Number(form.gad_amount) : null };
    try {
      if (editing) { await api.updateGad(editing.id, payload as any); toast.success('GAD entry updated'); }
      else { await api.createGad(payload as any); toast.success('GAD entry added'); }
      setFormOpen(false); load();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
  };
  const confirmDelete = async () => { const api = getAPI(); if (!api || deleteId == null) return; await api.deleteGad(deleteId); toast.success('Deleted'); setDeleteId(null); load(); };

  return (
    <div className="space-y-4">
      <PageHeader title="GAD Plan & Budget" description="BGADPBMS — Gender and Development programs, budget, and accomplishments.">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Entry</Button>
      </PageHeader>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search program / activity..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <HeartHandshake className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">No GAD entries yet.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Program / Activity</th><th className="px-4 py-3 text-left font-medium">Year</th>
              <th className="px-4 py-3 text-right font-medium">GAD Budget</th><th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>{items.map((g) => (
              <tr key={g.id} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => openEdit(g)}>
                <td className="max-w-[340px] truncate px-4 py-2.5 font-medium" title={g.program}>{g.program}{g.activity ? <span className="text-muted-foreground"> — {g.activity}</span> : ''}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{g.fiscal_year ?? '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{peso(g.gad_amount)}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] capitalize">{g.status}</Badge></td>
                <td className="px-4 py-2.5 text-right"><div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(g.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit GAD Entry' : 'Add GAD Entry'}</DialogTitle>
            <DialogDescription>Gender and Development plan/budget line item.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Program / PAP *</Label>
              <Input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Activity</Label>
              <Input value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} /></div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1"><Label className="text-xs">Fiscal Year</Label>
                <Input type="number" value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Total Budget (₱)</Label>
                <Input type="number" step="0.01" value={form.budget_amount} onChange={(e) => setForm({ ...form, budget_amount: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">GAD Amount (₱)</Label>
                <Input type="number" step="0.01" value={form.gad_amount} onChange={(e) => setForm({ ...form, gad_amount: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Accomplishment</Label>
              <Textarea rows={3} value={form.accomplishment} onChange={(e) => setForm({ ...form, accomplishment: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this entry?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
