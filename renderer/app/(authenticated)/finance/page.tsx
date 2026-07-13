'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAPI, type FinancialRecord } from '@/lib/ipc';
import { toast } from 'sonner';

const CATS = ['budget', 'appropriation', 'obligation', 'disbursement', 'income'];
const peso = (n: number | null) => n == null ? '—' : `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const thisYear = 2026;
const empty = { fiscal_year: String(thisYear), category: 'disbursement', account: '', description: '', amount: '', entry_date: '', reference_no: '' };

export default function FinancePage() {
  const [items, setItems] = useState<FinancialRecord[] | null>(null);
  const [summary, setSummary] = useState<{ category: string; total: number }[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialRecord | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => {
    const api = getAPI(); if (!api) return;
    const [rows, sum] = await Promise.all([api.getFinance({ search: debounced }), api.financeSummary()]);
    setItems(rows); setSummary(sum);
  }, [debounced]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setFormOpen(true); };
  const openEdit = (r: FinancialRecord) => {
    setEditing(r);
    setForm({ fiscal_year: r.fiscal_year != null ? String(r.fiscal_year) : '', category: r.category, account: r.account || '', description: r.description || '', amount: r.amount != null ? String(r.amount) : '', entry_date: r.entry_date || '', reference_no: r.reference_no || '' });
    setFormOpen(true);
  };
  const save = async () => {
    const api = getAPI(); if (!api) return;
    const payload = { ...form, fiscal_year: form.fiscal_year ? Number(form.fiscal_year) : null, amount: form.amount ? Number(form.amount) : null };
    try {
      if (editing) { await api.updateFinance(editing.id, payload as any); toast.success('Record updated'); }
      else { await api.createFinance(payload as any); toast.success('Record added'); }
      setFormOpen(false); load();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
  };
  const confirmDelete = async () => { const api = getAPI(); if (!api || deleteId == null) return; await api.deleteFinance(deleteId); toast.success('Deleted'); setDeleteId(null); load(); };

  return (
    <div className="space-y-4">
      <PageHeader title="Financial Records" description="BFMS — budget, appropriations, obligations, and disbursements.">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Record</Button>
      </PageHeader>

      {summary.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CATS.map((c) => {
            const total = summary.find((s) => s.category === c)?.total || 0;
            return <Card key={c}><CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground capitalize">{c}</p>
              <p className="font-semibold tabular-nums">{peso(total)}</p>
            </CardContent></Card>;
          })}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search account, description, ref..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Wallet className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">No financial records yet.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Date</th><th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-left font-medium">Account / Description</th><th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>{items.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => openEdit(r)}>
                <td className="px-4 py-2.5 text-muted-foreground">{r.entry_date || '—'}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] capitalize">{r.category}</Badge></td>
                <td className="px-4 py-2.5">{r.account || r.description || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{peso(r.amount)}</td>
                <td className="px-4 py-2.5 text-right"><div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Record' : 'Add Financial Record'}</DialogTitle>
            <DialogDescription>Budget/appropriation/obligation/disbursement entry.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Fiscal Year</Label>
                <Input type="number" value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Date</Label>
                <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Account</Label>
              <Input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} placeholder="e.g. Maintenance & Other Operating Expenses" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Amount (₱)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Reference No.</Label>
                <Input value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the entry.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
