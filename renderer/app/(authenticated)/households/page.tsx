'use client';

import { useCallback, useEffect, useState } from 'react';
import { Home, Pencil, Plus, Search, Trash2, Users, Star, X, Printer } from 'lucide-react';
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
import { getAPI, type Household, type Resident } from '@/lib/ipc';
import { toast } from 'sonner';

const RELATIONSHIPS = ['Head', 'Spouse', 'Son', 'Daughter', 'Parent', 'Sibling', 'Grandparent', 'Grandchild', 'Relative', 'Boarder', 'Other'];

export default function HouseholdsPage() {
  const [households, setHouseholds] = useState<Household[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  // Create/edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Household | null>(null);
  const [form, setForm] = useState({ household_number: '', address: '', purok: '', housing_type: '' });

  // Members dialog
  const [membersFor, setMembersFor] = useState<Household | null>(null);
  const [members, setMembers] = useState<Resident[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<Resident[]>([]);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    const data = await api.getHouseholds({ search: debounced });
    setHouseholds(data);
  }, [debounced]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ household_number: '', address: '', purok: '', housing_type: '' });
    setFormOpen(true);
  };

  const openEdit = (h: Household) => {
    setEditing(h);
    setForm({
      household_number: h.household_number || '',
      address: h.address || '',
      purok: h.purok || '',
      housing_type: h.housing_type || '',
    });
    setFormOpen(true);
  };

  const saveForm = async () => {
    const api = getAPI();
    if (!api) return;
    if (!form.address.trim()) { toast.error('Address is required'); return; }
    try {
      if (editing) {
        await api.updateHousehold(editing.id, form);
        toast.success('Household updated');
      } else {
        await api.createHousehold(form);
        toast.success('Household created');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    }
  };

  const confirmDelete = async () => {
    const api = getAPI();
    if (!api || deleteId == null) return;
    await api.deleteHousehold(deleteId);
    toast.success('Household deleted (members detached)');
    setDeleteId(null);
    load();
  };

  // ── Members management ──
  const openMembers = async (h: Household) => {
    const api = getAPI();
    if (!api) return;
    setMembersFor(h);
    setMemberQuery('');
    setMemberResults([]);
    const m = await api.getHouseholdMembers(h.id);
    setMembers(m);
  };

  const refreshMembers = async () => {
    const api = getAPI();
    if (!api || !membersFor) return;
    const [m, list] = await Promise.all([
      api.getHouseholdMembers(membersFor.id),
      api.getHouseholds({ search: debounced }),
    ]);
    setMembers(m);
    setHouseholds(list);
    const updated = list.find(x => x.id === membersFor.id);
    if (updated) setMembersFor(updated);
  };

  useEffect(() => {
    if (!memberQuery.trim() || memberQuery.length < 2) { setMemberResults([]); return; }
    const t = setTimeout(async () => {
      const api = getAPI();
      if (!api) return;
      const res = await api.searchResidents(memberQuery, 10);
      const memberIds = new Set(members.map(m => m.id));
      setMemberResults(res.filter(r => !memberIds.has(r.id)));
    }, 300);
    return () => clearTimeout(t);
  }, [memberQuery, members]);

  const addMember = async (r: Resident) => {
    const api = getAPI();
    if (!api || !membersFor) return;
    await api.addHouseholdMember(membersFor.id, r.id);
    setMemberQuery('');
    setMemberResults([]);
    refreshMembers();
  };

  const setRelationship = async (r: Resident, relationship: string) => {
    const api = getAPI();
    if (!api || !membersFor) return;
    await api.addHouseholdMember(membersFor.id, r.id, relationship);
    refreshMembers();
  };

  const makeHead = async (r: Resident) => {
    const api = getAPI();
    if (!api || !membersFor) return;
    await api.setHouseholdHead(membersFor.id, r.id);
    toast.success(`${r.first_name} ${r.last_name} set as head`);
    refreshMembers();
  };

  const removeMember = async (r: Resident) => {
    const api = getAPI();
    if (!api) return;
    await api.removeHouseholdMember(r.id);
    refreshMembers();
  };

  const printRoster = async () => {
    const api = getAPI();
    if (!api || !membersFor) return;
    const columns = [
      { key: 'name', label: 'Name' },
      { key: 'relationship', label: 'Relationship to Head' },
      { key: 'age', label: 'Age' },
      { key: 'gender', label: 'Sex' },
      { key: 'civil_status', label: 'Civil Status' },
    ];
    const rows = members.map(m => ({
      name: [m.last_name, [m.first_name, m.middle_name].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      relationship: m.relationship_to_head || (membersFor.head_resident_id === m.id ? 'Head' : '—'),
      age: m.age ?? '',
      gender: m.gender || '',
      civil_status: m.civil_status || '',
    }));
    const title = `Household ${membersFor.household_number || membersFor.id} Roster`;
    const res = await api.printList({ headerHtml: '', rows, columns, title, mode: 'download' });
    if (res.success) toast.success('Roster generated'); else toast.error(res.error || 'Print failed');
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Households" description="RBI Form A — household records and rosters">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Household</Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search households..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
      </div>

      {households === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : households.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Home className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No households yet. Click “Add Household” to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {households.map(h => (
            <Card key={h.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{h.household_number || `Household #${h.id}`}</p>
                    <p className="text-xs text-muted-foreground">{h.address}{h.purok ? ` · ${h.purok}` : ''}</p>
                  </div>
                  <Badge variant="secondary" className="font-normal"><Users className="mr-1 h-3 w-3" />{h.member_count ?? 0}</Badge>
                </div>
                <p className="text-xs">
                  <span className="text-muted-foreground">Head: </span>
                  {h.head_name || <span className="text-muted-foreground/60">none</span>}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => openMembers(h)}><Users className="mr-1 h-3 w-3" />Members</Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(h)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(h.id)}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Household' : 'Add Household'}</DialogTitle>
            <DialogDescription>Household details for the RBI household roster (Form A).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Household No.</Label>
                <Input value={form.household_number} onChange={e => setForm({ ...form, household_number: e.target.value })} placeholder="e.g. HH-001" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Purok</Label>
                <Input value={form.purok} onChange={e => setForm({ ...form, purok: e.target.value })} placeholder="e.g. Purok 1" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Address *</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Housing Type</Label>
              <Input value={form.housing_type} onChange={e => setForm({ ...form, housing_type: e.target.value })} placeholder="e.g. Owned, Rented, Informal settler" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={saveForm}>{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={!!membersFor} onOpenChange={(o) => !o && setMembersFor(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{membersFor?.household_number || `Household #${membersFor?.id}`} — Members</DialogTitle>
            <DialogDescription>{membersFor?.address}</DialogDescription>
          </DialogHeader>

          {/* Add member */}
          <div className="space-y-1">
            <Label className="text-xs">Add resident to this household</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search resident by name..." value={memberQuery} onChange={e => setMemberQuery(e.target.value)} />
            </div>
            {memberResults.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded-md border bg-popover">
                {memberResults.map(r => (
                  <button key={r.id} type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent" onClick={() => addMember(r)}>
                    <span>{r.first_name} {r.last_name}</span>
                    <span className="text-xs text-muted-foreground">{r.age ? `Age ${r.age}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Member list */}
          <div className="space-y-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : members.map(m => {
              const isHead = membersFor?.head_resident_id === m.id;
              return (
                <div key={m.id} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.first_name} {m.last_name}
                      {isHead && <Badge className="ml-2" variant="default"><Star className="mr-1 h-3 w-3" />Head</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.age ? `${m.age}y` : ''} {m.gender}</p>
                  </div>
                  <Select value={m.relationship_to_head || ''} onValueChange={(v) => setRelationship(m, v)}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Relationship" /></SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIPS.map(rel => <SelectItem key={rel} value={rel}>{rel}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!isHead && (
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => makeHead(m)} title="Set as head">
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-destructive hover:text-destructive" onClick={() => removeMember(m)} title="Remove from household">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={printRoster} disabled={members.length === 0}><Printer className="mr-2 h-4 w-4" />Print Roster</Button>
            <Button onClick={() => setMembersFor(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this household?</AlertDialogTitle>
            <AlertDialogDescription>
              The household record will be removed. Its members are kept and simply detached from the household.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
