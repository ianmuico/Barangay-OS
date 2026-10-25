'use client';

import { useCallback, useEffect, useState } from 'react';
import { Boxes, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAPI, type Asset } from '@/lib/ipc';
import { toast } from 'sonner';

const CATEGORIES = ['Infrastructure', 'Equipment', 'Furniture', 'Vehicle', 'Land', 'Other'];
const CONDITIONS = ['Good', 'Fair', 'Poor', 'Unserviceable'];
const empty = { item_name: '', category: '', quantity: '', unit: '', acquisition_date: '', acquisition_cost: '', location: '', condition: '', custodian: '', description: '' };

export default function AssetsPage() {
  const [items, setItems] = useState<Asset[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => { const api = getAPI(); if (!api) return; setItems(await api.getAssets({ search: debounced })); }, [debounced]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setFormOpen(true); };
  const openEdit = (a: Asset) => {
    setEditing(a);
    setForm({
      item_name: a.item_name, category: a.category || '', quantity: a.quantity != null ? String(a.quantity) : '',
      unit: a.unit || '', acquisition_date: a.acquisition_date || '', acquisition_cost: a.acquisition_cost != null ? String(a.acquisition_cost) : '',
      location: a.location || '', condition: a.condition || '', custodian: a.custodian || '', description: a.description || '',
    });
    setFormOpen(true);
  };
  const save = async () => {
    const api = getAPI(); if (!api) return;
    if (!form.item_name.trim()) { toast.error('Item name is required'); return; }
    const payload = { ...form, quantity: form.quantity ? Number(form.quantity) : null, acquisition_cost: form.acquisition_cost ? Number(form.acquisition_cost) : null };
    try {
      if (editing) { await api.updateAsset(editing.id, payload as any); toast.success('Asset updated'); }
      else { await api.createAsset(payload as any); toast.success('Asset added'); }
      setFormOpen(false); load();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
  };
  const confirmDelete = async () => { const api = getAPI(); if (!api || deleteId == null) return; await api.deleteAsset(deleteId); toast.success('Asset deleted'); setDeleteId(null); load(); };

  return (
    <div className="space-y-4">
      <PageHeader title="Assets & Property" description="BAMS — inventory of barangay-owned property and assets.">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Asset</Button>
      </PageHeader>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search assets..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Boxes className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">No assets yet.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Item</th><th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th><th className="px-4 py-3 text-left font-medium">Location</th>
              <th className="px-4 py-3 text-left font-medium">Condition</th><th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>{items.map((a) => (
              <tr key={a.id} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => openEdit(a)}>
                <td className="px-4 py-2.5 font-medium">{a.item_name}</td>
                <td className="px-4 py-2.5">{a.category ? <Badge variant="outline" className="text-[10px]">{a.category}</Badge> : '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.quantity ?? '—'}{a.unit ? ` ${a.unit}` : ''}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.location || '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.condition || '—'}</td>
                <td className="px-4 py-2.5 text-right"><div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Asset' : 'Add Asset'}</DialogTitle>
            <DialogDescription>Barangay property / asset record (COA-style inventory).</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Item Name *</Label>
              <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Quantity</Label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Unit</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, set" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Acquisition Date</Label>
                <Input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Acquisition Cost (₱)</Label>
                <Input type="number" step="0.01" value={form.acquisition_cost} onChange={(e) => setForm({ ...form, acquisition_cost: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Condition</Label>
                <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Custodian</Label>
                <Input value={form.custodian} onChange={(e) => setForm({ ...form, custodian: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this asset?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
