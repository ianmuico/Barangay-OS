'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { getAPI, type DevelopmentProject } from '@/lib/ipc';
import { toast } from 'sonner';

const STATUSES = ['proposed', 'ongoing', 'completed', 'cancelled'];
const peso = (n: number | null) => n == null ? '—' : `₱${Number(n).toLocaleString('en-PH')}`;
const empty = { project_name: '', sector: '', status: 'proposed', budget: '', funding_source: '', start_date: '', target_date: '', description: '' };

export default function DevelopmentPage() {
  const [items, setItems] = useState<DevelopmentProject[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DevelopmentProject | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => { const api = getAPI(); if (!api) return; setItems(await api.getProjects({ search: debounced, status })); }, [debounced, status]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setFormOpen(true); };
  const openEdit = (p: DevelopmentProject) => {
    setEditing(p);
    setForm({ project_name: p.project_name, sector: p.sector || '', status: p.status, budget: p.budget != null ? String(p.budget) : '', funding_source: p.funding_source || '', start_date: p.start_date || '', target_date: p.target_date || '', description: p.description || '' });
    setFormOpen(true);
  };
  const save = async () => {
    const api = getAPI(); if (!api) return;
    if (!form.project_name.trim()) { toast.error('Project name is required'); return; }
    const payload = { ...form, budget: form.budget ? Number(form.budget) : null };
    try {
      if (editing) { await api.updateProject(editing.id, payload as any); toast.success('Project updated'); }
      else { await api.createProject(payload as any); toast.success('Project added'); }
      setFormOpen(false); load();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
  };
  const confirmDelete = async () => { const api = getAPI(); if (!api || deleteId == null) return; await api.deleteProject(deleteId); toast.success('Deleted'); setDeleteId(null); load(); };

  return (
    <div className="space-y-4">
      <PageHeader title="Development Plan" description="BDP — barangay development projects and resource allocation.">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Project</Button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search projects..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="proposed">Proposed</TabsTrigger>
            <TabsTrigger value="ongoing">Ongoing</TabsTrigger><TabsTrigger value="completed">Completed</TabsTrigger></TabsList>
        </Tabs>
      </div>
      {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <ClipboardList className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">No projects yet.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Project</th><th className="px-4 py-3 text-left font-medium">Sector</th>
              <th className="px-4 py-3 text-right font-medium">Budget</th><th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>{items.map((p) => (
              <tr key={p.id} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => openEdit(p)}>
                <td className="max-w-[320px] truncate px-4 py-2.5 font-medium" title={p.project_name}>{p.project_name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.sector || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{peso(p.budget)}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] capitalize">{p.status}</Badge></td>
                <td className="px-4 py-2.5 text-right"><div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit Project' : 'Add Project'}</DialogTitle>
            <DialogDescription>Barangay development project record.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Project Name *</Label>
              <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Sector</Label>
                <Input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} placeholder="Health, Infra..." /></div>
              <div className="space-y-1"><Label className="text-xs">Budget (₱)</Label>
                <Input type="number" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Funding Source</Label>
                <Input value={form.funding_source} onChange={(e) => setForm({ ...form, funding_source: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Start Date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Target Date</Label>
                <Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this project?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
