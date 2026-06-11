'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Pencil, Plus, Search, Store, Trash2, UserPlus, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAPI, type Business, type Resident, type ReportTemplate } from '@/lib/ipc';
import { templateVisibleOn } from '@/lib/constants';
import { ResidentDetailDialog } from '@/components/resident-detail-dialog';
import { toast } from 'sonner';

interface OwnerChip {
  resident_id?: number | null;
  outside_owner_id?: number | null;
  name: string;
}

export default function BusinessesPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editBusiness, setEditBusiness] = useState<Business | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [nature, setNature] = useState('');
  const [address, setAddress] = useState('');
  const [purok, setPurok] = useState('');
  const [status, setStatus] = useState('active');
  const [dateRegistered, setDateRegistered] = useState('');
  const [notes, setNotes] = useState('');
  const [owners, setOwners] = useState<OwnerChip[]>([]);

  // Resident owner search
  const [ownerQuery, setOwnerQuery] = useState('');
  const [ownerResults, setOwnerResults] = useState<Resident[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Outside owner sub-form
  const [outsideOpen, setOutsideOpen] = useState(false);
  const [oFirst, setOFirst] = useState('');
  const [oMiddle, setOMiddle] = useState('');
  const [oLast, setOLast] = useState('');
  const [oSuffix, setOSuffix] = useState('');
  const [oGender, setOGender] = useState('');
  const [oAddress, setOAddress] = useState('');
  const [oContact, setOContact] = useState('');
  const [oEmail, setOEmail] = useState('');

  // Document template picker
  const [docPickerBusiness, setDocPickerBusiness] = useState<Business | null>(null);
  const [docTemplates, setDocTemplates] = useState<ReportTemplate[]>([]);

  // Resident profile modal
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchBusinesses = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    setBusinesses(await api.getBusinesses({ search: debounced, status: statusFilter }));
  }, [debounced, statusFilter]);

  useEffect(() => { fetchBusinesses(); }, [fetchBusinesses]);

  const handleOwnerSearch = (value: string) => {
    setOwnerQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setOwnerResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const api = getAPI();
      if (!api) return;
      setOwnerResults(await api.searchResidents(value.trim(), 8));
    }, 300);
  };

  const addResidentOwner = (r: Resident) => {
    if (owners.some(o => o.resident_id === r.id)) return;
    setOwners(prev => [...prev, { resident_id: r.id, name: `${r.first_name} ${r.last_name}${r.suffix ? ` ${r.suffix}` : ''}` }]);
    setOwnerQuery('');
    setOwnerResults([]);
  };

  const addOutsideOwner = async () => {
    const api = getAPI();
    if (!api || !oFirst.trim() || !oLast.trim()) { toast.error('First and last name are required'); return; }
    const id = await api.createOutsideOwner({
      first_name: oFirst.trim(), middle_name: oMiddle.trim() || null, last_name: oLast.trim(),
      suffix: oSuffix.trim() || null, gender: oGender || null, address: oAddress.trim() || null,
      contact_number: oContact.trim() || null, email: oEmail.trim() || null,
    });
    setOwners(prev => [...prev, { outside_owner_id: id, name: `${oFirst.trim()} ${oLast.trim()}${oSuffix.trim() ? ` ${oSuffix.trim()}` : ''} (outside)` }]);
    setOFirst(''); setOMiddle(''); setOLast(''); setOSuffix(''); setOGender(''); setOAddress(''); setOContact(''); setOEmail('');
    setOutsideOpen(false);
    toast.success('Outside owner added — they appear in the Outside Owners page');
  };

  const openNew = () => {
    setEditBusiness(null);
    setName(''); setNature(''); setAddress(''); setPurok(''); setStatus('active');
    setDateRegistered(''); setNotes(''); setOwners([]);
    setFormOpen(true);
  };

  const openEdit = async (b: Business) => {
    const api = getAPI();
    if (!api) return;
    setEditBusiness(b);
    setName(b.name); setNature(b.nature || ''); setAddress(b.address || '');
    setPurok(b.purok || ''); setStatus(b.status); setDateRegistered(b.date_registered || '');
    setNotes(b.notes || '');
    const list = await api.getBusinessOwners(b.id);
    setOwners(list.map(o => ({
      resident_id: o.resident_id, outside_owner_id: o.outside_owner_id,
      name: `${o.name || 'Owner'}${o.is_outside ? ' (outside)' : ''}`,
    })));
    setFormOpen(true);
  };

  const handleSave = async () => {
    const api = getAPI();
    if (!api) return;
    if (!name.trim()) { toast.error('Business name is required'); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(), nature: nature.trim() || null, address: address.trim() || null,
        purok: purok.trim() || null, status: status as 'active' | 'closed',
        date_registered: dateRegistered || null, notes: notes.trim() || null,
      };
      const ownerRefs = owners.map(o => ({ resident_id: o.resident_id ?? null, outside_owner_id: o.outside_owner_id ?? null }));
      if (editBusiness) {
        await api.updateBusiness(editBusiness.id, data, ownerRefs);
        toast.success('Business updated');
      } else {
        await api.createBusiness(data, ownerRefs);
        toast.success('Business registered');
      }
      setFormOpen(false);
      fetchBusinesses();
    } finally { setSaving(false); }
  };

  const openDocPicker = async (b: Business) => {
    const api = getAPI();
    if (!api) return;
    try { setDocTemplates((await api.getTemplates()).filter(t => templateVisibleOn(t, 'businesses'))); } catch { setDocTemplates([]); }
    setDocPickerBusiness(b);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const api = getAPI();
    if (!api) return;
    await api.deleteBusiness(deleteId);
    toast.success('Business deleted');
    setDeleteId(null);
    fetchBusinesses();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title="Businesses" description="Businesses operating in the barangay and their owners." />
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Register Business</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, nature, or owner..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!businesses ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
      ) : businesses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16">
            <Store className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No businesses registered yet.</p>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Register Business</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Business</th>
                <th className="px-4 py-3 text-left font-medium">Nature</th>
                <th className="px-4 py-3 text-left font-medium">Owners</th>
                <th className="px-4 py-3 text-left font-medium">Location</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id} className="cursor-pointer border-b transition-colors hover:bg-muted/30" onClick={() => openEdit(b)}>
                  <td className="px-4 py-2.5 font-medium">{b.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{b.nature || '—'}</td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-muted-foreground" title={b.owner_names || ''}>{b.owner_names || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{[b.address, b.purok ? `Purok ${b.purok}` : null].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={b.status === 'active' ? 'default' : 'secondary'} className="text-[10px] capitalize">{b.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Create document (clearance, permit, custom)" onClick={() => openDocPicker(b)}><FileText className="h-4 w-4" /></Button>
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

      {/* ─── Business form ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editBusiness ? 'Edit Business' : 'Register Business'}</DialogTitle>
            <DialogDescription>Owners can be residents (search below) or people from outside the barangay.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Business Name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Aling Nena's Sari-Sari Store" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nature of Business</Label>
                <Input value={nature} onChange={(e) => setNature(e.target.value)} placeholder="e.g., Sari-sari store" />
              </div>
              <div className="space-y-2">
                <Label>Date Registered</Label>
                <Input type="date" value={dateRegistered} onChange={(e) => setDateRegistered(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Purok</Label>
                <Input value={purok} onChange={(e) => setPurok(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Owners */}
            <div className="space-y-2 rounded-lg border p-3">
              <Label>Owners {owners.length > 1 && <span className="text-xs text-muted-foreground">({owners.length})</span>}</Label>
              {owners.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {owners.map((o, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-sm">
                      {o.resident_id ? (
                        <button type="button" className="hover:underline" title="View resident profile"
                          onClick={() => { setDetailId(o.resident_id!); setDetailOpen(true); }}>
                          {o.name}
                        </button>
                      ) : o.name}
                      <button type="button" onClick={() => setOwners(prev => prev.filter((_, idx) => idx !== i))}
                        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/20">
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search resident to add as owner..." className="pl-9" value={ownerQuery} onChange={(e) => handleOwnerSearch(e.target.value)} />
              </div>
              {ownerResults.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-md border">
                  {ownerResults.map((r) => (
                    <button key={r.id} type="button" className="block w-full border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent" onClick={() => addResidentOwner(r)}>
                      {r.first_name} {r.last_name}{r.suffix ? ` ${r.suffix}` : ''} <span className="text-xs text-muted-foreground">· {r.purok ? `Purok ${r.purok}` : 'resident'}</span>
                    </button>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => setOutsideOpen(true)}>
                <UserPlus className="mr-2 h-3.5 w-3.5" />Add owner from outside the barangay
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editBusiness ? 'Update' : 'Register'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Outside owner sub-form ─── */}
      <Dialog open={outsideOpen} onOpenChange={setOutsideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Outside Owner</DialogTitle>
            <DialogDescription>
              A person from outside the barangay who owns this business. They are kept in the
              Outside Owners list, not in the resident records.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name <span className="text-destructive">*</span></Label>
              <Input value={oFirst} onChange={(e) => setOFirst(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name <span className="text-destructive">*</span></Label>
              <Input value={oLast} onChange={(e) => setOLast(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Middle Name</Label>
              <Input value={oMiddle} onChange={(e) => setOMiddle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Suffix</Label>
              <Input value={oSuffix} onChange={(e) => setOSuffix(e.target.value)} placeholder="Jr., Sr., III" />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={oGender} onValueChange={setOGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contact Number</Label>
              <Input value={oContact} onChange={(e) => setOContact(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Address (outside the barangay)</Label>
              <Input value={oAddress} onChange={(e) => setOAddress(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Email</Label>
              <Input value={oEmail} onChange={(e) => setOEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutsideOpen(false)}>Cancel</Button>
            <Button onClick={addOutsideOwner}>Add Owner</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Document template picker ─── */}
      <Dialog open={!!docPickerBusiness} onOpenChange={() => setDocPickerBusiness(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Document — {docPickerBusiness?.name}</DialogTitle>
            <DialogDescription>
              Start from a template (business details and the owner are filled in automatically) or from a blank page,
              then edit, print, or export. The document is saved and can be reopened anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            <button
              type="button"
              className="w-full rounded-md border border-dashed px-3 py-2.5 text-left text-sm font-medium hover:bg-accent transition-colors"
              onClick={() => docPickerBusiness && router.push(`/documents/editor?businessId=${docPickerBusiness.id}`)}
            >
              Blank document
              <span className="block text-xs font-normal text-muted-foreground">Letterhead + business info scaffold, write the rest yourself</span>
            </button>
            {docTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="w-full rounded-md border px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                onClick={() => docPickerBusiness && router.push(`/documents/editor?businessId=${docPickerBusiness.id}&templateId=${t.id}`)}
              >
                {t.name}
              </button>
            ))}
            {docTemplates.length === 0 && (
              <p className="px-1 py-2 text-xs text-muted-foreground">No templates are tagged for the Businesses page yet — tag them in the template editor ("Shows" button), or start blank.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ─── */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Business</AlertDialogTitle>
            <AlertDialogDescription>This removes the business record and its owner links. Owners themselves are not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResidentDetailDialog residentId={detailId} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
