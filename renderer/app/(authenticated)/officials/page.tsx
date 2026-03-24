'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SquircleAvatar } from '@/components/squircle-avatar';
import { getAPI, type Official, type Resident } from '@/lib/ipc';
import { toast } from 'sonner';

export default function OfficialsPage() {
  const [officials, setOfficials] = useState<Official[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOfficial, setEditOfficial] = useState<Official | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [position, setPosition] = useState('');
  const [residentId, setResidentId] = useState<number | null>(null);
  const [residentName, setResidentName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  // Resident search state
  const [residentQuery, setResidentQuery] = useState('');
  const [residentResults, setResidentResults] = useState<Resident[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOfficials = async () => {
    const api = getAPI();
    if (!api) return;
    const data = await api.getOfficials();
    setOfficials(data);
  };

  useEffect(() => {
    fetchOfficials();
  }, []);

  const handleResidentSearch = useCallback((value: string) => {
    setResidentQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResidentResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const api = getAPI();
      if (!api) return;
      const res = await api.searchResidents(value.trim());
      setResidentResults(res);
    }, 300);
  }, []);

  const selectResident = (r: Resident) => {
    setResidentId(r.id);
    const name = `${r.first_name} ${r.last_name}${r.suffix ? ` ${r.suffix}` : ''}`;
    setResidentName(name);
    setResidentQuery('');
    setResidentResults([]);
  };

  const resetForm = () => {
    setPosition('');
    setResidentId(null);
    setResidentName('');
    setStartDate('');
    setEndDate('');
    setSortOrder('0');
    setResidentQuery('');
    setResidentResults([]);
  };

  const openNew = () => {
    setEditOfficial(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (o: Official) => {
    setEditOfficial(o);
    setPosition(o.position);
    setResidentId(o.resident_id);
    const name = o.first_name
      ? `${o.first_name} ${o.last_name || ''}${o.suffix ? ` ${o.suffix}` : ''}`
      : '';
    setResidentName(name.trim());
    setStartDate(o.start_date || '');
    setEndDate(o.end_date || '');
    setSortOrder(String(o.sort_order));
    setResidentQuery('');
    setResidentResults([]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!position.trim()) {
      toast.error('Position is required');
      return;
    }
    const api = getAPI();
    if (!api) return;

    setSaving(true);
    try {
      const data = {
        position: position.trim(),
        resident_id: residentId,
        start_date: startDate || null,
        end_date: endDate || null,
        sort_order: Number(sortOrder) || 0,
      };

      if (editOfficial) {
        await api.updateOfficial(editOfficial.id, data);
        toast.success('Official updated');
      } else {
        await api.createOfficial(data);
        toast.success('Official added');
      }

      setDialogOpen(false);
      fetchOfficials();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const api = getAPI();
    if (!api) return;
    await api.deleteOfficial(deleteId);
    toast.success('Official removed');
    setDeleteId(null);
    fetchOfficials();
  };

  const buildOfficialName = (o: Official) => {
    if (!o.first_name) return 'Unlinked';
    let name = `${o.first_name}`;
    if (o.middle_name) name += ` ${o.middle_name.charAt(0)}.`;
    name += ` ${o.last_name || ''}`;
    if (o.suffix) name += ` ${o.suffix}`;
    return name.trim();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Barangay Officials" description="Manage elected and appointed officials" />
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Official
        </Button>
      </div>

      {officials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No officials added yet.</p>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Official
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {officials.map((o) => {
            const name = buildOfficialName(o);
            return (
              <Card key={o.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div className="flex items-center gap-3">
                    <SquircleAvatar name={name} id={o.id} size="lg" />
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{o.position}</CardTitle>
                      <p className="text-sm text-muted-foreground truncate">{name}</p>
                    </div>
                  </div>
                  <Badge variant={o.is_active ? 'default' : 'secondary'}>
                    {o.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {o.start_date && <p>From: {o.start_date}</p>}
                      {o.end_date && <p>Until: {o.end_date}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(o)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(o.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editOfficial ? 'Edit Official' : 'Add Official'}</DialogTitle>
            <DialogDescription>
              {editOfficial
                ? 'Update the official details below.'
                : 'Fill in the details to add a new barangay official.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g., Barangay Captain"
              />
            </div>

            <div className="space-y-2">
              <Label>Linked Resident</Label>
              {residentName && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{residentName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setResidentId(null);
                      setResidentName('');
                    }}
                  >
                    Clear
                  </Button>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search resident to link..."
                  className="pl-9"
                  value={residentQuery}
                  onChange={(e) => handleResidentSearch(e.target.value)}
                />
              </div>
              {residentResults.length > 0 && (
                <div className="rounded-md border max-h-40 overflow-y-auto">
                  {residentResults.map((r) => (
                    <button
                      key={r.id}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors border-b last:border-b-0"
                      onClick={() => selectResident(r)}
                    >
                      {r.first_name} {r.last_name}{r.suffix ? ` ${r.suffix}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort-order">Sort Order</Label>
              <Input
                id="sort-order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editOfficial ? 'Update' : 'Add Official'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Official</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this official? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
