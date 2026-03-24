'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, X, Link2, Unlink, Plus, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { type Resident, getAPI } from '@/lib/ipc';
import { getGradientForId, getInitials, GRADIENT_COLORS } from '@/lib/constants';
import { OccupationSelect } from '@/components/occupation-select';

interface ResidentFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  resident?: Resident | null;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// Compact person-link row for partner/mother/father
function PersonLinkRow({
  label,
  personId,
  personName,
  onSelect,
  onRemove,
  excludeId,
}: {
  label: string;
  personId: number | null;
  personName: string;
  onSelect: (r: Resident) => void;
  onRemove: () => void;
  excludeId?: number | null;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resident[]>([]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const api = getAPI();
      if (!api) return;
      const data = await api.searchResidents(query, 10);
      setResults(data.filter((r) => r.id !== excludeId));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, excludeId]);

  const handleSelect = (r: Resident) => {
    onSelect(r);
    setSearching(false);
    setQuery('');
    setResults([]);
  };

  const handleCancel = () => {
    setSearching(false);
    setQuery('');
    setResults([]);
  };

  if (searching) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">{label}</span>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
        {results.length > 0 && (
          <div className="ml-28 max-h-32 overflow-y-auto rounded-md border bg-popover">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                onClick={() => handleSelect(p)}
              >
                <span>{p.first_name} {p.last_name}</span>
                <span className="text-xs text-muted-foreground">{p.age ? `Age ${p.age}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1">
        {personId && personName ? (
          <Badge variant="secondary" className="font-normal">{personName}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground/60">Not set</span>
        )}
      </div>
      {personId && personName ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onRemove}>
          <Unlink className="mr-1 h-3 w-3" />Remove
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSearching(true)}>
          <Link2 className="mr-1 h-3 w-3" />Link
        </Button>
      )}
    </div>
  );
}

export function ResidentForm({ open, onClose, onSave, resident }: ResidentFormProps) {
  const [formData, setFormData] = useState({
    first_name: '', middle_name: '', last_name: '', suffix: '',
    birth_date: '', gender: 'Male', civil_status: 'Single',
    address: '', purok: '', contact_number: '', email: '',
    occupation: '', is_indigent: false, voter_status: 'Not Registered',
    blood_type: '', notes: '',
    partner_id: null as number | null,
    mother_id: null as number | null,
    father_id: null as number | null,
    // New fields
    religion: '',
    citizenship: 'Filipino',
    philsys_card_no: '',
    educational_attainment: '',
    is_4ps: false,
    status: 'living',
  });
  const [saving, setSaving] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [children, setChildren] = useState<Resident[]>([]);
  const [childSearching, setChildSearching] = useState(false);
  const [childQuery, setChildQuery] = useState('');
  const [childResults, setChildResults] = useState<Resident[]>([]);

  useEffect(() => {
    if (open) {
      setFormData({
        first_name: resident?.first_name || '',
        middle_name: resident?.middle_name || '',
        last_name: resident?.last_name || '',
        suffix: resident?.suffix || '',
        birth_date: resident?.birth_date || '',
        gender: resident?.gender || 'Male',
        civil_status: resident?.civil_status || 'Single',
        address: resident?.address || '',
        purok: resident?.purok || '',
        contact_number: resident?.contact_number || '',
        email: resident?.email || '',
        occupation: resident?.occupation || '',
        is_indigent: resident?.is_indigent === 1,
        voter_status: resident?.voter_status || 'Not Registered',
        blood_type: resident?.blood_type || '',
        notes: resident?.notes || '',
        partner_id: resident?.partner_id || null,
        mother_id: resident?.mother_id || null,
        father_id: resident?.father_id || null,
        religion: resident?.religion || '',
        citizenship: resident?.citizenship || 'Filipino',
        philsys_card_no: resident?.philsys_card_no || '',
        educational_attainment: resident?.educational_attainment || '',
        is_4ps: resident?.is_4ps === 1,
        status: resident?.status || 'living',
      });

      const api = getAPI();
      if (!api) return;

      const loadName = (id: number | null | undefined, setter: (n: string) => void) => {
        if (id) {
          api.getResident(id).then((p) => {
            if (p) setter(`${p.first_name} ${p.last_name}`);
            else setter('');
          });
        } else {
          setter('');
        }
      };

      loadName(resident?.partner_id, setPartnerName);
      loadName(resident?.mother_id, setMotherName);
      loadName(resident?.father_id, setFatherName);

      // Load children
      if (resident?.id) {
        api.getChildrenOf(resident.id).then(setChildren);
      } else {
        setChildren([]);
      }
    }
  }, [open, resident]);

  // Child search with debounce
  useEffect(() => {
    if (!childQuery.trim() || childQuery.length < 2) {
      setChildResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const api = getAPI();
      if (!api) return;
      const data = await api.searchResidents(childQuery, 10);
      // Exclude self and already-linked children
      const childIds = new Set(children.map(c => c.id));
      setChildResults(data.filter((r) => r.id !== resident?.id && !childIds.has(r.id)));
    }, 300);
    return () => clearTimeout(timer);
  }, [childQuery, resident?.id, children]);

  const handleAddChild = async (child: Resident) => {
    const api = getAPI();
    if (!api || !resident?.id) return;
    await api.addChildLink(resident.id, formData.gender, child.id);
    setChildren((prev) => [...prev, child]);
    setChildSearching(false);
    setChildQuery('');
    setChildResults([]);
  };

  const handleRemoveChild = async (child: Resident) => {
    const api = getAPI();
    if (!api || !resident?.id) return;
    await api.removeChildLink(resident.id, formData.gender, child.id);
    setChildren((prev) => prev.filter(c => c.id !== child.id));
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...formData,
        is_indigent: formData.is_indigent ? 1 : 0,
        is_4ps: formData.is_4ps ? 1 : 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Compute gradient from resident id or name hash
  const gradientId = useMemo(() => {
    if (resident?.id) return resident.id;
    const combined = `${formData.first_name}${formData.last_name}`.trim();
    return combined ? hashString(combined) : 0;
  }, [resident?.id, formData.first_name, formData.last_name]);

  const [gradientFrom, gradientTo] = getGradientForId(gradientId);

  const displayName = useMemo(() => {
    const parts = [formData.first_name, formData.last_name].filter(Boolean);
    return parts.join(' ') || 'New Resident';
  }, [formData.first_name, formData.last_name]);

  const initials = useMemo(() => {
    return getInitials(displayName);
  }, [displayName]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto overflow-x-hidden p-0 gap-0" closeClassName="text-white">
        <DialogDescription className="sr-only">
          {resident ? 'Update the resident information below.' : 'Fill in the resident information below.'}
        </DialogDescription>

        <form onSubmit={handleSubmit}>
          {/* ── Gradient Profile Header ── */}
          <div className="relative">
            {/* Banner */}
            <div
              className="h-20 w-full"
              style={{
                background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
              }}
            />

            {/* Squircle Avatar */}
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-8">
              <div
                className="h-16 w-16 flex items-center justify-center text-white font-bold text-lg shadow-lg border-4 border-background"
                style={{
                  borderRadius: '22%',
                  background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
                }}
              >
                {initials}
              </div>
            </div>
          </div>

          {/* Spacer for avatar overflow */}
          <div className="h-10" />

          <div className="px-6 pb-6 space-y-5">

            {/* ── Name Inputs ── */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">First Name *</Label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) => handleChange('first_name', e.target.value)}
                    required
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Last Name *</Label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) => handleChange('last_name', e.target.value)}
                    required
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Middle Name</Label>
                  <Input
                    value={formData.middle_name}
                    onChange={(e) => handleChange('middle_name', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Suffix</Label>
                  <Input
                    placeholder="Jr., Sr., III"
                    value={formData.suffix}
                    onChange={(e) => handleChange('suffix', e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* ── Status Row ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date of Birth *</Label>
                <Input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => handleChange('birth_date', e.target.value)}
                  required
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gender *</Label>
                <Select value={formData.gender} onValueChange={(v) => handleChange('gender', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Civil Status *</Label>
                <Select value={formData.civil_status} onValueChange={(v) => handleChange('civil_status', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single">Single</SelectItem>
                    <SelectItem value="Married">Married</SelectItem>
                    <SelectItem value="Widowed">Widowed</SelectItem>
                    <SelectItem value="Separated">Separated</SelectItem>
                    <SelectItem value="Divorced">Divorced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Location Section ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Purok</Label>
                  <Input
                    placeholder="e.g. Purok 1"
                    value={formData.purok}
                    onChange={(e) => handleChange('purok', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* ── Contact & Work Section ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact & Work</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Contact Number</Label>
                  <Input
                    value={formData.contact_number}
                    onChange={(e) => handleChange('contact_number', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Occupation</Label>
                <OccupationSelect
                  value={formData.occupation}
                  onChange={(v) => handleChange('occupation', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Blood Type</Label>
                  <Select value={formData.blood_type || ''} onValueChange={(v) => handleChange('blood_type', v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Voter Status</Label>
                <Select value={formData.voter_status} onValueChange={(v) => handleChange('voter_status', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Registered">Registered</SelectItem>
                    <SelectItem value="Not Registered">Not Registered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Government & Education Section ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Government & Education</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">PhilSys Card No.</Label>
                  <Input
                    placeholder="PCN-XXXX-XXXX-XXXX"
                    value={formData.philsys_card_no}
                    onChange={(e) => handleChange('philsys_card_no', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Citizenship</Label>
                  <Input
                    value={formData.citizenship}
                    onChange={(e) => handleChange('citizenship', e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Religion</Label>
                  <Input
                    value={formData.religion}
                    onChange={(e) => handleChange('religion', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Educational Attainment</Label>
                  <Select value={formData.educational_attainment || ''} onValueChange={(v) => handleChange('educational_attainment', v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="None">None</SelectItem>
                      <SelectItem value="Elementary">Elementary</SelectItem>
                      <SelectItem value="High School">High School</SelectItem>
                      <SelectItem value="Vocational">Vocational</SelectItem>
                      <SelectItem value="College">College</SelectItem>
                      <SelectItem value="Post Graduate">Post Graduate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="living">Living</SelectItem>
                    <SelectItem value="deceased">Deceased</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Family Links Section ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Family Links</p>
              <div className="space-y-2 rounded-lg border p-3">
                <PersonLinkRow
                  label="Partner / Spouse"
                  personId={formData.partner_id}
                  personName={partnerName}
                  excludeId={resident?.id}
                  onSelect={(r) => { handleChange('partner_id', r.id); setPartnerName(`${r.first_name} ${r.last_name}`); }}
                  onRemove={() => { handleChange('partner_id', null); setPartnerName(''); }}
                />
                <div className="border-t" />
                <PersonLinkRow
                  label="Mother"
                  personId={formData.mother_id}
                  personName={motherName}
                  excludeId={resident?.id}
                  onSelect={(r) => { handleChange('mother_id', r.id); setMotherName(`${r.first_name} ${r.last_name}`); }}
                  onRemove={() => { handleChange('mother_id', null); setMotherName(''); }}
                />
                <div className="border-t" />
                <PersonLinkRow
                  label="Father"
                  personId={formData.father_id}
                  personName={fatherName}
                  excludeId={resident?.id}
                  onSelect={(r) => { handleChange('father_id', r.id); setFatherName(`${r.first_name} ${r.last_name}`); }}
                  onRemove={() => { handleChange('father_id', null); setFatherName(''); }}
                />

                {/* ── Children Section ── */}
                {resident?.id && (
                  <>
                    <div className="border-t" />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Children
                          {children.length > 0 && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground/60">({children.length})</span>
                          )}
                        </span>
                        {!childSearching && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setChildSearching(true)}
                          >
                            <Plus className="mr-1 h-3 w-3" />Add
                          </Button>
                        )}
                      </div>

                      {/* Search for child */}
                      {childSearching && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                placeholder="Search resident to add as child..."
                                value={childQuery}
                                onChange={(e) => setChildQuery(e.target.value)}
                                className="h-8 pl-8 text-sm"
                                autoFocus
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => { setChildSearching(false); setChildQuery(''); setChildResults([]); }}
                            >
                              Cancel
                            </Button>
                          </div>
                          {childResults.length > 0 && (
                            <div className="max-h-32 overflow-y-auto rounded-md border bg-popover">
                              {childResults.map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                                  onClick={() => handleAddChild(r)}
                                >
                                  <span>{r.first_name} {r.last_name}</span>
                                  <span className="text-xs text-muted-foreground">{r.age ? `Age ${r.age}` : ''}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 pl-1">
                            Will set this resident as {formData.gender === 'Female' ? 'mother' : 'father'} of the selected child.
                          </p>
                        </div>
                      )}

                      {/* Children list */}
                      {children.length > 0 ? (
                        <div className="space-y-1">
                          {children.map((child) => (
                            <div key={child.id} className="flex items-center gap-2 pl-1">
                              <div className="flex-1 min-w-0">
                                <Badge variant="secondary" className="font-normal">
                                  {child.first_name} {child.last_name}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                  {child.age ? `${child.age}y` : ''} {child.gender === 'Male' ? '♂' : '♀'}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive"
                                onClick={() => handleRemoveChild(child)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : !childSearching ? (
                        <p className="text-[11px] text-muted-foreground/60 pl-1">No children linked</p>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Flags ── */}
            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-3">
                <Switch
                  id="is_indigent"
                  checked={formData.is_indigent}
                  onCheckedChange={(checked) => handleChange('is_indigent', checked)}
                />
                <Label htmlFor="is_indigent" className="text-sm">Indigent</Label>
              </div>
              <div className="flex items-center space-x-3">
                <Switch
                  id="is_4ps"
                  checked={formData.is_4ps}
                  onCheckedChange={(checked) => handleChange('is_4ps', checked)}
                />
                <Label htmlFor="is_4ps" className="text-sm">4Ps Beneficiary</Label>
              </div>
            </div>

            {/* ── Notes ── */}
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <textarea
                className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
              />
            </div>

            {/* ── Footer ── */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : resident ? 'Update' : 'Add Resident'}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
