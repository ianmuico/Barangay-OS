'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Scale,
  CalendarDays,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Printer,
  FileDown,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getAPI, type Resident } from '@/lib/ipc';
import { cachedFetch, invalidateCache } from '@/lib/cache';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CaseRecord {
  id: number;
  case_number: string;
  case_type: string;
  complainant_id: number | null;
  respondent_id: number | null;
  description: string | null;
  status: string;
  filed_date: string;
  resolved_date: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  complainant_name?: string;
  respondent_name?: string;
}

interface SummonRecord {
  id: number;
  case_id: number;
  summoned_resident_id: number | null;
  summon_number: number;
  summon_date: string;
  summon_time: string | null;
  status: string;
  served_by_official_id: number | null;
  notes: string | null;
  created_at: string;
  summoned_name?: string;
  official_name?: string;
  case_number?: string;
}

// ─── PersonSearchInput ──────────────────────────────────────────────────────

function PersonSearchInput({
  label,
  selectedId,
  selectedName,
  onSelect,
  onClear,
}: {
  label: string;
  selectedId: number | null;
  selectedName: string;
  onSelect: (r: Resident) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resident[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const api = getAPI() as any;
      if (!api) return;
      const res = await api.searchResidents(value.trim(), 10);
      setResults(res);
    }, 300);
  }, []);

  const select = (r: Resident) => {
    onSelect(r);
    setQuery('');
    setResults([]);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {selectedName && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="flex-1 truncate">{selectedName}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClear}>
            Clear
          </Button>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search resident..."
          className="pl-9"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      {results.length > 0 && (
        <div className="rounded-md border max-h-40 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors border-b last:border-b-0"
              onClick={() => select(r)}
            >
              {r.first_name} {r.last_name}
              {r.suffix ? ` ${r.suffix}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Badge Helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ongoing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  dismissed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const TYPE_COLORS: Record<string, string> = {
  mediation: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  complaint: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  dispute: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const SUMMON_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  served: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  appeared: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  no_show: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[type] || TYPE_COLORS.other}`}>
      {type}
    </span>
  );
}

function SummonStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${SUMMON_STATUS_COLORS[status] || SUMMON_STATUS_COLORS.scheduled}`}>
      {status === 'no_show' ? 'No Show' : status}
    </span>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function residentDisplayName(r: Resident): string {
  return `${r.first_name} ${r.last_name}${r.suffix ? ` ${r.suffix}` : ''}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function CasesPage() {
  const api = getAPI() as any;

  // List state
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);

  // Create / Edit case dialog
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);
  const [editCase, setEditCase] = useState<CaseRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Case form
  const [formType, setFormType] = useState('mediation');
  const [formComplainantId, setFormComplainantId] = useState<number | null>(null);
  const [formComplainantName, setFormComplainantName] = useState('');
  const [formRespondentId, setFormRespondentId] = useState<number | null>(null);
  const [formRespondentName, setFormRespondentName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFiledDate, setFormFiledDate] = useState('');

  // Detail dialog
  const [detailCase, setDetailCase] = useState<CaseRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [summons, setSummons] = useState<SummonRecord[]>([]);

  // Summon form
  const [summonDialogOpen, setSummonDialogOpen] = useState(false);
  const [summonDate, setSummonDate] = useState('');
  const [summonTime, setSummonTime] = useState('');
  const [summonStatus, setSummonStatus] = useState('scheduled');
  const [summonNotes, setSummonNotes] = useState('');
  const [editSummon, setEditSummon] = useState<SummonRecord | null>(null);

  // Resolve dialog
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolveStatus, setResolveStatus] = useState('resolved');

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchCases = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (searchQuery) params.search = searchQuery;
      if (filterStatus !== 'all') params.status = filterStatus;
      const data = await cachedFetch(`cases-${searchQuery}-${filterStatus}`, () => api.getCases(params), true);
      setCases(data as CaseRecord[]);
    } finally {
      setLoading(false);
    }
  }, [api, searchQuery, filterStatus]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const fetchSummons = useCallback(async (caseId: number) => {
    if (!api) return;
    const data = await api.getSummons(caseId);
    setSummons(data);
  }, [api]);

  // ─── Print case details ────────────────────────────────────────────────
  const handlePrintCase = async () => {
    if (!api || !detailCase) return;
    const settings = await api.getAllSettings();
    const html = `
      <div style="text-align:center;margin-bottom:20px;">
        <p style="margin:0;font-size:10pt;">Republic of the Philippines</p>
        <p style="margin:0;font-size:10pt;">${settings.province || ''}</p>
        <p style="margin:0;font-size:10pt;">Municipality of ${settings.municipality || ''}</p>
        <p style="margin:4px 0;font-size:14pt;font-weight:bold;">${(settings.barangay_name || 'BARANGAY').toUpperCase()}</p>
        <p style="margin:0;font-size:10pt;">OFFICE OF THE LUPONG TAGAPAMAYAPA</p>
      </div>
      <h2 style="text-align:center;margin:20px 0;">CASE RECORD</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11pt;">
        <tr><td style="padding:6px;border:1px solid #000;width:30%;font-weight:bold;">Case Number</td><td style="padding:6px;border:1px solid #000;">${detailCase.case_number}</td></tr>
        <tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Type</td><td style="padding:6px;border:1px solid #000;">${detailCase.case_type}</td></tr>
        <tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Complainant</td><td style="padding:6px;border:1px solid #000;">${detailCase.complainant_name || '-'}</td></tr>
        <tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Respondent</td><td style="padding:6px;border:1px solid #000;">${detailCase.respondent_name || '-'}</td></tr>
        <tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Filed Date</td><td style="padding:6px;border:1px solid #000;">${detailCase.filed_date}</td></tr>
        <tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Status</td><td style="padding:6px;border:1px solid #000;">${detailCase.status.toUpperCase()}</td></tr>
        ${detailCase.description ? `<tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Description</td><td style="padding:6px;border:1px solid #000;">${detailCase.description}</td></tr>` : ''}
        ${detailCase.resolution_notes ? `<tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Resolution</td><td style="padding:6px;border:1px solid #000;">${detailCase.resolution_notes}</td></tr>` : ''}
      </table>
      ${summons.length > 0 ? `
        <h3 style="margin:20px 0 10px;">Summons History</h3>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <tr style="background:#f0f0f0;">
            <th style="padding:6px;border:1px solid #000;">#</th>
            <th style="padding:6px;border:1px solid #000;">Date</th>
            <th style="padding:6px;border:1px solid #000;">Time</th>
            <th style="padding:6px;border:1px solid #000;">Status</th>
            <th style="padding:6px;border:1px solid #000;">Notes</th>
          </tr>
          ${summons.map((s: any) => `
            <tr>
              <td style="padding:6px;border:1px solid #000;text-align:center;">${s.summon_number}</td>
              <td style="padding:6px;border:1px solid #000;">${s.summon_date}</td>
              <td style="padding:6px;border:1px solid #000;">${s.summon_time || '-'}</td>
              <td style="padding:6px;border:1px solid #000;">${s.status}</td>
              <td style="padding:6px;border:1px solid #000;">${s.notes || '-'}</td>
            </tr>
          `).join('')}
        </table>
      ` : ''}
    `;
    await api.printReport(html);
  };

  // ─── Case form handlers ────────────────────────────────────────────────

  const resetCaseForm = () => {
    setFormType('mediation');
    setFormComplainantId(null);
    setFormComplainantName('');
    setFormRespondentId(null);
    setFormRespondentName('');
    setFormDescription('');
    setFormFiledDate(new Date().toISOString().split('T')[0]);
  };

  const openNewCase = () => {
    setEditCase(null);
    resetCaseForm();
    setCaseDialogOpen(true);
  };

  const openEditCase = (c: CaseRecord) => {
    setEditCase(c);
    setFormType(c.case_type);
    setFormComplainantId(c.complainant_id);
    setFormComplainantName(c.complainant_name || '');
    setFormRespondentId(c.respondent_id);
    setFormRespondentName(c.respondent_name || '');
    setFormDescription(c.description || '');
    setFormFiledDate(c.filed_date);
    setCaseDialogOpen(true);
  };

  const handleSaveCase = async () => {
    if (!api) return;
    setSaving(true);
    try {
      const data = {
        case_type: formType,
        complainant_id: formComplainantId,
        respondent_id: formRespondentId,
        description: formDescription || null,
        filed_date: formFiledDate || new Date().toISOString().split('T')[0],
      };

      if (editCase) {
        await api.updateCase(editCase.id, data);
        toast.success('Case updated');
        // Refresh detail if open
        if (detailCase?.id === editCase.id) {
          const updated = { ...detailCase, ...data, complainant_name: formComplainantName, respondent_name: formRespondentName };
          setDetailCase(updated);
        }
      } else {
        await api.createCase(data);
        toast.success('Case created');
      }

      setCaseDialogOpen(false);
      invalidateCache('cases');
      fetchCases();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save case');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCase = async () => {
    if (!deleteId || !api) return;
    try {
      await api.deleteCase(deleteId);
      toast.success('Case deleted');
      invalidateCache('cases');
      if (detailCase?.id === deleteId) {
        setDetailOpen(false);
        setDetailCase(null);
      }
      fetchCases();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete case');
    }
    setDeleteId(null);
  };

  // ─── Case detail ───────────────────────────────────────────────────────

  const openDetail = async (c: CaseRecord) => {
    setDetailCase(c);
    setDetailOpen(true);
    await fetchSummons(c.id);
  };

  // ─── Resolve / Dismiss ─────────────────────────────────────────────────

  const openResolve = () => {
    setResolutionNotes('');
    setResolveStatus('resolved');
    setResolveDialogOpen(true);
  };

  const handleResolve = async () => {
    if (!api || !detailCase) return;
    setSaving(true);
    try {
      await api.updateCase(detailCase.id, {
        status: resolveStatus,
        resolved_date: new Date().toISOString().split('T')[0],
        resolution_notes: resolutionNotes || null,
      });
      toast.success(`Case ${resolveStatus}`);
      setResolveDialogOpen(false);
      invalidateCache('cases');
      // Refresh detail
      const refreshed = await api.getCases({ search: detailCase.case_number });
      if (refreshed?.length) {
        setDetailCase(refreshed[0]);
      }
      fetchCases();
    } finally {
      setSaving(false);
    }
  };

  // ─── Summon handlers ───────────────────────────────────────────────────

  const resetSummonForm = () => {
    setSummonDate('');
    setSummonTime('');
    setSummonStatus('scheduled');
    setSummonNotes('');
    setEditSummon(null);
  };

  const openNewSummon = () => {
    resetSummonForm();
    setSummonDialogOpen(true);
  };

  const openEditSummon = (s: SummonRecord) => {
    setEditSummon(s);
    setSummonDate(s.summon_date);
    setSummonTime(s.summon_time || '');
    setSummonStatus(s.status);
    setSummonNotes(s.notes || '');
    setSummonDialogOpen(true);
  };

  const handleSaveSummon = async () => {
    if (!api || !detailCase) return;
    if (!summonDate) {
      toast.error('Summon date is required');
      return;
    }
    setSaving(true);
    try {
      if (editSummon) {
        await api.updateSummon(editSummon.id, {
          summon_date: summonDate,
          summon_time: summonTime || null,
          status: summonStatus,
          notes: summonNotes || null,
        });
        toast.success('Summon updated');
      } else {
        await api.createSummon({
          case_id: detailCase.id,
          summon_date: summonDate,
          summon_time: summonTime || null,
          status: summonStatus,
          notes: summonNotes || null,
        });
        toast.success('Summon created');
      }
      setSummonDialogOpen(false);
      fetchSummons(detailCase.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save summon');
    } finally {
      setSaving(false);
    }
  };

  // ─── Search debounce ───────────────────────────────────────────────────

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      invalidateCache('cases');
    }, 300);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader title="Cases & Summons" description="Manage barangay mediation cases, complaints, disputes, and summons" />
        <Button onClick={openNewCase}>
          <Plus className="mr-2 h-4 w-4" />
          Add Case
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search cases..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); invalidateCache('cases'); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="ongoing">Ongoing</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cases Table */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading cases...</p>
          </CardContent>
        </Card>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-4">No cases found.</p>
            <Button onClick={openNewCase}>
              <Plus className="mr-2 h-4 w-4" />
              Add Case
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Case #</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Complainant</th>
                <th className="px-4 py-3 text-left font-medium">Respondent</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Filed</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr
                  key={c.id}
                  className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => openDetail(c)}
                >
                  <td className="px-4 py-3 font-mono text-sm">{c.case_number}</td>
                  <td className="px-4 py-3"><TypeBadge type={c.case_type} /></td>
                  <td className="px-4 py-3 truncate max-w-[160px]">{c.complainant_name || <span className="text-muted-foreground">-</span>}</td>
                  <td className="px-4 py-3 truncate max-w-[160px]">{c.respondent_name || <span className="text-muted-foreground">-</span>}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(c.filed_date)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCase(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Create / Edit Case Dialog ──────────────────────────────────── */}
      <Dialog open={caseDialogOpen} onOpenChange={setCaseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editCase ? 'Edit Case' : 'New Case'}</DialogTitle>
            <DialogDescription>
              {editCase ? 'Update the case details below.' : 'Fill in the details to file a new case.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Case Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mediation">Mediation</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="dispute">Dispute</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <PersonSearchInput
              label="Complainant"
              selectedId={formComplainantId}
              selectedName={formComplainantName}
              onSelect={(r) => { setFormComplainantId(r.id); setFormComplainantName(residentDisplayName(r)); }}
              onClear={() => { setFormComplainantId(null); setFormComplainantName(''); }}
            />

            <PersonSearchInput
              label="Respondent"
              selectedId={formRespondentId}
              selectedName={formRespondentName}
              onSelect={(r) => { setFormRespondentId(r.id); setFormRespondentName(residentDisplayName(r)); }}
              onClear={() => { setFormRespondentId(null); setFormRespondentName(''); }}
            />

            <div className="space-y-2">
              <Label htmlFor="case-description">Description</Label>
              <Textarea
                id="case-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of the case..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filed-date">Filed Date</Label>
              <Input
                id="filed-date"
                type="date"
                value={formFiledDate}
                onChange={(e) => setFormFiledDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaseDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCase} disabled={saving}>
              {saving ? 'Saving...' : editCase ? 'Update' : 'Create Case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Case Detail Dialog ─────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailCase && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-lg">
                      Case {detailCase.case_number}
                    </DialogTitle>
                    <DialogDescription className="sr-only">Case details and summons timeline</DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <TypeBadge type={detailCase.case_type} />
                    <StatusBadge status={detailCase.status} />
                  </div>
                </div>
              </DialogHeader>

              {/* Case Info */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Complainant</p>
                    <p className="font-medium">{detailCase.complainant_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Respondent</p>
                    <p className="font-medium">{detailCase.respondent_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Filed Date</p>
                    <p>{formatDate(detailCase.filed_date)}</p>
                  </div>
                  {detailCase.resolved_date && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Resolved Date</p>
                      <p>{formatDate(detailCase.resolved_date)}</p>
                    </div>
                  )}
                </div>

                {detailCase.description && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Description</p>
                    <p className="whitespace-pre-wrap">{detailCase.description}</p>
                  </div>
                )}

                {detailCase.resolution_notes && (
                  <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3 text-sm">
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">Resolution Notes</p>
                    <p className="whitespace-pre-wrap">{detailCase.resolution_notes}</p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrintCase}>
                    <Printer className="mr-2 h-3.5 w-3.5" />
                    Print Case
                  </Button>
                  {(detailCase.status === 'pending' || detailCase.status === 'ongoing') && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => {
                        openEditCase(detailCase);
                      }}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit Case
                      </Button>
                      <Button size="sm" onClick={openResolve} className="bg-green-600 hover:bg-green-700 text-white">
                        <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                        Resolve / Dismiss
                      </Button>
                    </>
                  )}
                </div>

                {/* ─── Summons Timeline ────────────────────────────────────── */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm">Summons Timeline</h3>
                    <Button variant="outline" size="sm" onClick={openNewSummon}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Summon
                    </Button>
                  </div>

                  {summons.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No summons issued yet.
                    </div>
                  ) : (
                    <div className="relative pl-6">
                      {/* Vertical timeline line */}
                      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />

                      <div className="space-y-4">
                        {summons.map((s, idx) => (
                          <div key={s.id} className="relative">
                            {/* Timeline dot */}
                            <div className={`absolute -left-6 top-1.5 h-[18px] w-[18px] rounded-full border-2 flex items-center justify-center ${
                              s.status === 'appeared' ? 'border-green-500 bg-green-100 dark:bg-green-950' :
                              s.status === 'no_show' ? 'border-red-500 bg-red-100 dark:bg-red-950' :
                              s.status === 'served' ? 'border-violet-500 bg-violet-100 dark:bg-violet-950' :
                              'border-blue-500 bg-blue-100 dark:bg-blue-950'
                            }`}>
                              {s.status === 'appeared' && <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />}
                              {s.status === 'no_show' && <XCircle className="h-2.5 w-2.5 text-red-600" />}
                              {s.status === 'served' && <AlertCircle className="h-2.5 w-2.5 text-violet-600" />}
                              {s.status === 'scheduled' && <Clock className="h-2.5 w-2.5 text-blue-600" />}
                            </div>

                            {/* Summon card */}
                            <div className="rounded-md border bg-card p-3 text-sm">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Summon #{s.summon_number}</span>
                                  <SummonStatusBadge status={s.status} />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditSummon(s)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-4 text-muted-foreground text-xs">
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />
                                  {formatDate(s.summon_date)}
                                </span>
                                {s.summon_time && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {s.summon_time}
                                  </span>
                                )}
                                {s.summoned_name && (
                                  <span>Summoned: {s.summoned_name}</span>
                                )}
                              </div>
                              {s.notes && (
                                <p className="mt-1.5 text-xs text-muted-foreground whitespace-pre-wrap">{s.notes}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Summon Create / Edit Dialog ────────────────────────────────── */}
      <Dialog open={summonDialogOpen} onOpenChange={setSummonDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editSummon ? 'Edit Summon' : 'New Summon'}</DialogTitle>
            <DialogDescription>
              {editSummon ? 'Update the summon details.' : 'Schedule a new summon for this case.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="summon-date">Date</Label>
                <Input
                  id="summon-date"
                  type="date"
                  value={summonDate}
                  onChange={(e) => setSummonDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summon-time">Time</Label>
                <Input
                  id="summon-time"
                  type="time"
                  value={summonTime}
                  onChange={(e) => setSummonTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={summonStatus} onValueChange={setSummonStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="served">Served</SelectItem>
                  <SelectItem value="appeared">Appeared</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="summon-notes">Notes</Label>
              <Textarea
                id="summon-notes"
                value={summonNotes}
                onChange={(e) => setSummonNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSummonDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSummon} disabled={saving}>
              {saving ? 'Saving...' : editSummon ? 'Update' : 'Add Summon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Resolve / Dismiss Dialog ───────────────────────────────────── */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve or Dismiss Case</DialogTitle>
            <DialogDescription>
              Choose the outcome and optionally add resolution notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={resolveStatus} onValueChange={setResolveStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolution-notes">Resolution Notes</Label>
              <Textarea
                id="resolution-notes"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe the resolution or reason for dismissal..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleResolve}
              disabled={saving}
              className={resolveStatus === 'resolved' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
            >
              {saving ? 'Saving...' : resolveStatus === 'resolved' ? 'Resolve Case' : 'Dismiss Case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ────────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Case</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this case? All associated summons will also be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCase}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
