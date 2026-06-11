'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Search, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAPI, type OutsideOwner } from '@/lib/ipc';
import { toast } from 'sonner';

// People who don't live in the barangay but own businesses or property here.
// Kept separate from resident records so they never affect population counts.
export default function OutsideOwnersPage() {
  const [rows, setRows] = useState<OutsideOwner[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editOwner, setEditOwner] = useState<OutsideOwner | null>(null);
  const [saving, setSaving] = useState(false);
  const [first, setFirst] = useState('');
  const [middle, setMiddle] = useState('');
  const [last, setLast] = useState('');
  const [suffix, setSuffix] = useState('');
  const [gender, setGender] = useState('');
  const [addr, setAddr] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchRows = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    setRows(await api.getOutsideOwners(debounced || undefined));
  }, [debounced]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const openNew = () => {
    setEditOwner(null);
    setFirst(''); setMiddle(''); setLast(''); setSuffix(''); setGender('');
    setAddr(''); setContact(''); setEmail(''); setNotes('');
    setFormOpen(true);
  };

  const openEdit = (o: OutsideOwner) => {
    setEditOwner(o);
    setFirst(o.first_name); setMiddle(o.middle_name || ''); setLast(o.last_name);
    setSuffix(o.suffix || ''); setGender(o.gender || ''); setAddr(o.address || '');
    setContact(o.contact_number || ''); setEmail(o.email || ''); setNotes(o.notes || '');
    setFormOpen(true);
  };

  const handleSave = async () => {
    const api = getAPI();
    if (!api) return;
    if (!first.trim() || !last.trim()) { toast.error('First and last name are required'); return; }
    setSaving(true);
    try {
      const data = {
        first_name: first.trim(), middle_name: middle.trim() || null, last_name: last.trim(),
        suffix: suffix.trim() || null, gender: gender || null, address: addr.trim() || null,
        contact_number: contact.trim() || null, email: email.trim() || null, notes: notes.trim() || null,
      };
      if (editOwner) {
        await api.updateOutsideOwner(editOwner.id, data);
        toast.success('Outside owner updated');
      } else {
        await api.createOutsideOwner(data);
        toast.success('Outside owner added');
      }
      setFormOpen(false);
      fetchRows();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const api = getAPI();
    if (!api) return;
    await api.deleteOutsideOwner(deleteId);
    toast.success('Outside owner deleted');
    setDeleteId(null);
    fetchRows();
  };

  const name = (o: OutsideOwner) => [o.first_name, o.middle_name, o.last_name, o.suffix].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title="Outside Owners" description="People from outside the barangay who own businesses or property here — kept separate from resident records." />
        <Button onClick={openNew}><UserPlus className="mr-2 h-4 w-4" />Add Outside Owner</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search outside owners..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!rows ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16">
            <UserPlus className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No outside owners yet. They are usually added while registering a business.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Businesses Here</th>
                <th className="px-4 py-3 text-left font-medium">Address</th>
                <th className="px-4 py-3 text-left font-medium">Contact</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="cursor-pointer border-b transition-colors hover:bg-muted/30" onClick={() => openEdit(o)}>
                  <td className="px-4 py-2.5 font-medium">{name(o)}</td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-muted-foreground" title={o.business_names || ''}>{o.business_names || '—'}</td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground">{o.address || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{o.contact_number || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editOwner ? 'Edit Outside Owner' : 'Add Outside Owner'}</DialogTitle>
            <DialogDescription>Not a resident — does not appear in resident lists or population counts.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name <span className="text-destructive">*</span></Label>
              <Input value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name <span className="text-destructive">*</span></Label>
              <Input value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Middle Name</Label>
              <Input value={middle} onChange={(e) => setMiddle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Suffix</Label>
              <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="Jr., Sr., III" />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contact Number</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Address</Label>
              <Input value={addr} onChange={(e) => setAddr(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editOwner ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Outside Owner</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the person and their ownership links from any businesses. The businesses themselves stay.
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
