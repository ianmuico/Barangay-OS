'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookText, Pencil, Plus, Search, Trash2, ShieldAlert } from 'lucide-react';
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
import { getAPI, type BlotterEntry } from '@/lib/ipc';
import { toast } from 'sonner';

const CAT_LABEL: Record<string, string> = {
  incident: 'Incident', complaint: 'Complaint', vawc: 'VAWC', other: 'Other',
};

const emptyForm = {
  category: 'incident', incident_date: '', incident_time: '', location: '',
  reported_by: '', respondent: '', narrative: '', action_taken: '', status: 'open',
};

export default function BlotterPage() {
  const [items, setItems] = useState<BlotterEntry[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BlotterEntry | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    setItems(await api.getBlotter({ search: debounced, category }));
  }, [debounced, category]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, category: category === 'all' ? 'incident' : category });
    setFormOpen(true);
  };

  const openEdit = (b: BlotterEntry) => {
    setEditing(b);
    setForm({
      category: b.category, incident_date: b.incident_date || '', incident_time: b.incident_time || '',
      location: b.location || '', reported_by: b.reported_by || '', respondent: b.respondent || '',
      narrative: b.narrative || '', action_taken: b.action_taken || '', status: b.status,
    });
    setFormOpen(true);
  };

  const save = async () => {
    const api = getAPI();
    if (!api) return;
    if (!form.narrative.trim()) { toast.error('Narrative is required'); return; }
    try {
      if (editing) { await api.updateBlotter(editing.id, form); toast.success('Blotter entry updated'); }
      else { await api.createBlotter(form); toast.success('Blotter entry recorded'); }
      setFormOpen(false);
      load();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
  };

  const confirmDelete = async () => {
    const api = getAPI();
    if (!api || deleteId == null) return;
    await api.deleteBlotter(deleteId);
    toast.success('Entry deleted');
    setDeleteId(null);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Blotter & VAW Desk" description="Incident/complaint blotter, including a Violence Against Women & Children (VAWC) desk view.">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Entry</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search entry, party, location, narrative..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={category} onValueChange={setCategory}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="incident">Incidents</TabsTrigger>
            <TabsTrigger value="complaint">Complaints</TabsTrigger>
            <TabsTrigger value="vawc"><ShieldAlert className="mr-1 h-3.5 w-3.5" />VAW Desk</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <BookText className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No blotter entries. Click “New Entry” to record an incident.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Entry No.</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Parties</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="cursor-pointer border-b transition-colors hover:bg-muted/30" onClick={() => openEdit(b)}>
                  <td className="px-4 py-2.5 font-mono text-xs">{b.entry_no || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{b.incident_date || '—'}{b.incident_time ? ` ${b.incident_time}` : ''}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={b.is_vawc ? 'default' : 'outline'} className={b.is_vawc ? 'bg-rose-600 text-[10px]' : 'text-[10px]'}>{CAT_LABEL[b.category] || b.category}</Badge>
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-2.5 text-muted-foreground">
                    {[b.reported_by, b.respondent].filter(Boolean).join(' vs ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">{b.status}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete" onClick={() => setDeleteId(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            <DialogTitle>{editing ? `Edit Entry ${editing.entry_no || ''}` : 'New Blotter Entry'}</DialogTitle>
            <DialogDescription>Record an incident or complaint. Use the VAWC category for the VAW desk.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incident">Incident</SelectItem>
                    <SelectItem value="complaint">Complaint</SelectItem>
                    <SelectItem value="vawc">VAWC</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Time</Label>
                <Input type="time" value={form.incident_time} onChange={(e) => setForm({ ...form, incident_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Reported by / Complainant</Label>
                <Input value={form.reported_by} onChange={(e) => setForm({ ...form, reported_by: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Subject / Respondent</Label>
                <Input value={form.respondent} onChange={(e) => setForm({ ...form, respondent: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Narrative *</Label>
              <Textarea rows={5} value={form.narrative} onChange={(e) => setForm({ ...form, narrative: e.target.value })} placeholder="What happened…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Action Taken</Label>
                <Input value={form.action_taken} onChange={(e) => setForm({ ...form, action_taken: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="referred">Referred</SelectItem>
                    <SelectItem value="settled">Settled</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this blotter entry?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the record.</AlertDialogDescription>
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
