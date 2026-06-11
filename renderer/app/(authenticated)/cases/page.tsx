'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  FilePlus2,
  Printer,
  FileDown,
  Eye,
  User,
  ArrowRight,
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
import { getAPI, type Resident, type ReportTemplate } from '@/lib/ipc';
import { invalidateCache } from '@/lib/cache';
import { templateVisibleOn } from '@/lib/constants';
import { ResidentDetailDialog } from '@/components/resident-detail-dialog';
import { PaperPreview } from '@/components/paper-preview';
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
  complainant_names?: string;
  respondent_names?: string;
}

interface PartyRef {
  id: number;
  name: string;
}

// Aggregated parties list with legacy single-party fallback
function complainantsOf(c: CaseRecord): string {
  return c.complainant_names || c.complainant_name || '';
}
function respondentsOf(c: CaseRecord): string {
  return c.respondent_names || c.respondent_name || '';
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

// ─── MultiPersonSearchInput ─────────────────────────────────────────────────

function MultiPersonSearchInput({
  label,
  selected,
  onAdd,
  onRemove,
}: {
  label: string;
  selected: PartyRef[];
  onAdd: (r: Resident) => void;
  onRemove: (id: number) => void;
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
    onAdd(r);
    setQuery('');
    setResults([]);
  };

  const selectedIds = new Set(selected.map(s => s.id));

  return (
    <div className="space-y-2">
      <Label>{label} {selected.length > 1 && <span className="text-xs text-muted-foreground">({selected.length})</span>}</Label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-sm">
              {p.name}
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
                title="Remove"
              >
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={selected.length ? 'Add another resident...' : 'Search resident...'}
          className="pl-9"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      {results.length > 0 && (
        <div className="rounded-md border max-h-40 overflow-y-auto">
          {results.filter(r => !selectedIds.has(r.id)).map((r) => (
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
  const router = useRouter();

  // Custom document template picker
  const [customDocOpen, setCustomDocOpen] = useState(false);
  const [docTemplates, setDocTemplates] = useState<ReportTemplate[]>([]);

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
  const [formComplainants, setFormComplainants] = useState<PartyRef[]>([]);
  const [formRespondents, setFormRespondents] = useState<PartyRef[]>([]);
  const [formDescription, setFormDescription] = useState('');
  const [formFiledDate, setFormFiledDate] = useState('');

  // Detail dialog
  const [detailCase, setDetailCase] = useState<CaseRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailParties, setDetailParties] = useState<{ id: number; resident_id: number | null; role: string; name: string }[]>([]);
  const [residentDetailId, setResidentDetailId] = useState<number | null>(null);
  const [residentDetailOpen, setResidentDetailOpen] = useState(false);
  const [caseDocs, setCaseDocs] = useState<{ id: number; title: string | null; generated_at: string; content_html: string }[]>([]);
  const [previewedDocId, setPreviewedDocId] = useState<number | null>(null);
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

  // Case document preview dialog (shared by all 3 doc types)
  const [caseDocHtml, setCaseDocHtml] = useState<string | null>(null);
  const [caseDocTitle, setCaseDocTitle] = useState('');
  const [docExporting, setDocExporting] = useState(false);
  const [docPrinting, setDocPrinting] = useState(false);

  // Complaint Narrative form dialog
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const [narrativeIntro, setNarrativeIntro] = useState('');
  const [narrativeDetails, setNarrativeDetails] = useState('');
  const [narrativeWitnesses, setNarrativeWitnesses] = useState('');
  const [narrativeFindings, setNarrativeFindings] = useState('');
  const [narrativeRecommendation, setNarrativeRecommendation] = useState('');
  const [narrativeGenerating, setNarrativeGenerating] = useState(false);

  // ─── Data fetching ──────────────────────────────────────────────────────
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchCases = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterStatus !== 'all') params.status = filterStatus;
      const data = await api.getCases(params);
      setCases(data as CaseRecord[]);
    } finally {
      setLoading(false);
    }
  }, [api, debouncedSearch, filterStatus]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const fetchSummons = useCallback(async (caseId: number) => {
    if (!api) return;
    const data = await api.getSummons(caseId);
    setSummons(data);
  }, [api]);

  // ─── Build case document HTML ───────────────────────────────────────────
  const buildCaseDocHtml = async (): Promise<string | null> => {
    if (!api || !detailCase) return null;
    const settings = await api.getAllSettings();
    return `
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
        <tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Complainant</td><td style="padding:6px;border:1px solid #000;">${complainantsOf(detailCase) || '-'}</td></tr>
        <tr><td style="padding:6px;border:1px solid #000;font-weight:bold;">Respondent</td><td style="padding:6px;border:1px solid #000;">${respondentsOf(detailCase) || '-'}</td></tr>
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
  };

  // Open the document preview
  const handleViewCaseDocument = async () => {
    const html = await buildCaseDocHtml();
    setPreviewedDocId(null);
    if (html) {
      setCaseDocTitle(`Case ${detailCase?.case_number || ''}`);
      setCaseDocHtml(html);
    }
  };

  // Keep a copy of every printed/exported case document on the case
  const savedDocRef = useRef('');
  const saveCaseDoc = async () => {
    if (!api || !caseDocHtml || !detailCase || savedDocRef.current === caseDocHtml) return;
    if (previewedDocId) return; // already a saved document — don't duplicate
    try {
      const id = await api.saveDocument({ case_id: detailCase.id, title: caseDocTitle, content_html: caseDocHtml });
      setPreviewedDocId(id);
      savedDocRef.current = caseDocHtml;
      setCaseDocs(await api.getCaseDocuments(detailCase.id));
    } catch { /* best-effort */ }
  };

  // Print from preview
  const handlePrintCaseDoc = async () => {
    if (!api || !caseDocHtml) return;
    setDocPrinting(true);
    try {
      await saveCaseDoc();
      const result = await api.printReport(caseDocHtml);
      if (result.success) toast.success('Print dialog opened');
      else toast.error(result.error || 'Print failed');
    } finally {
      setDocPrinting(false);
    }
  };

  // Hand the generated document to the page editor for free editing
  const handleEditCaseDoc = () => {
    if (!caseDocHtml || !detailCase) return;
    sessionStorage.setItem('caseDocDraft', JSON.stringify({ html: caseDocHtml, title: caseDocTitle, reportId: previewedDocId }));
    setCaseDocHtml(null);
    setDetailOpen(false);
    router.push(`/documents/editor?caseId=${detailCase.id}&draft=1`);
  };

  // Save as PDF from preview
  const handleExportCaseDoc = async () => {
    if (!api || !caseDocHtml) return;
    setDocExporting(true);
    try {
      await saveCaseDoc();
      const filename = `Case_${detailCase?.case_number || 'record'}_${Date.now()}`;
      const result = await api.exportPDF(caseDocHtml, filename);
      if (result.success) toast.success('PDF saved');
      else toast.error(result.error || 'Save failed');
    } finally {
      setDocExporting(false);
    }
  };

  // ─── Summons Notice ────────────────────────────────────────────────────
  const buildSummonsNoticeHtml = async (s: SummonRecord): Promise<string | null> => {
    if (!api || !detailCase) return null;
    const settings = await api.getAllSettings();
    const officials = await api.getOfficials();
    const punongBarangay = officials.find((o: any) => o.is_active && /punong|captain|chairman/i.test(o.position));
    const pbName = punongBarangay
      ? `${punongBarangay.first_name || ''} ${punongBarangay.last_name || ''}`.trim()
      : '';
    const pbPosition = punongBarangay?.position || 'Punong Barangay';

    const hearingDate = s.summon_date
      ? new Date(s.summon_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
      : '___________';
    const hearingTime = s.summon_time || '___________';
    const issuedDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

    return `
      <div style="text-align:center;margin-bottom:20px;">
        <p style="margin:0;font-size:10pt;">Republic of the Philippines</p>
        <p style="margin:0;font-size:10pt;">${settings.province || ''}</p>
        <p style="margin:0;font-size:10pt;">Municipality of ${settings.municipality || ''}</p>
        <p style="margin:4px 0;font-size:14pt;font-weight:bold;">${(settings.barangay_name || 'BARANGAY').toUpperCase()}</p>
        <p style="margin:0;font-size:10pt;font-weight:bold;text-decoration:underline;">OFFICE OF THE LUPONG TAGAPAMAYAPA</p>
      </div>

      <div style="text-align:center;margin:24px 0 20px;">
        <h2 style="margin:0;letter-spacing:3px;font-size:16pt;">SUMMONS NOTICE</h2>
        <p style="margin:6px 0;font-size:10pt;">Summon No. ${s.summon_number} &nbsp;—&nbsp; Case No. ${detailCase.case_number}</p>
      </div>

      <p style="margin-top:20px;">To:</p>
      <p style="margin:4px 0 16px;font-weight:bold;font-size:12pt;">${s.summoned_name || respondentsOf(detailCase) || '___________________________'}</p>

      <p style="text-indent:40px;margin-bottom:12px;">
        You are hereby summoned to appear before the Lupong Tagapamayapa of
        <strong>Barangay ${settings.barangay_name || '___________'}</strong>,
        ${settings.municipality || '___________'}, ${settings.province || '___________'}
        on <strong>${hearingDate}</strong> at <strong>${hearingTime}</strong>
        to answer for a <strong>${detailCase.case_type}</strong> case
        ${complainantsOf(detailCase) ? `filed against you by <strong>${complainantsOf(detailCase)}</strong>` : 'filed against you'}.
      </p>

      ${detailCase.description ? `
        <p style="text-indent:40px;margin-bottom:12px;">
          <strong>Nature of Complaint:</strong> ${detailCase.description}
        </p>
      ` : ''}

      <p style="text-indent:40px;margin-bottom:12px;">
        Failure to appear before the Lupong Tagapamayapa without justifiable cause
        on the date and time above shall be grounds for the issuance of a
        <em>Certification to File Action</em> in the appropriate court.
      </p>

      <p style="text-indent:40px;">Issued this <strong>${issuedDate}</strong> at
        Barangay ${settings.barangay_name || '___________'},
        ${settings.municipality || '___________'},
        ${settings.province || '___________'}.
      </p>

      ${pbName ? `
        <div style="margin-top:50px;">
          <p style="margin:0;font-weight:bold;">${pbName}</p>
          <p style="margin:0;">${pbPosition}</p>
          <p style="margin:0;font-size:10pt;">Lupong Tagapamayapa</p>
        </div>
      ` : ''}
    `;
  };

  const handleViewSummonsNotice = async (s: SummonRecord) => {
    const html = await buildSummonsNoticeHtml(s);
    setPreviewedDocId(null);
    if (html) {
      setCaseDocTitle(`Summons Notice — Case ${detailCase?.case_number} / Summon #${s.summon_number}`);
      setCaseDocHtml(html);
    }
  };

  // ─── Custom Document (template or scratch, edited in the paper editor) ──
  const openCustomDoc = async () => {
    if (!api) return;
    try { setDocTemplates((await api.getTemplates()).filter((t: ReportTemplate) => templateVisibleOn(t, 'cases'))); } catch { setDocTemplates([]); }
    setCustomDocOpen(true);
  };

  // ─── Complaint Narrative ────────────────────────────────────────────────
  const openComplaintNarrative = () => {
    setNarrativeIntro(detailCase?.description || '');
    setNarrativeDetails('');
    setNarrativeWitnesses('');
    setNarrativeFindings('');
    setNarrativeRecommendation('');
    setNarrativeOpen(true);
  };

  const handleGenerateNarrative = async () => {
    if (!api || !detailCase) return;
    setNarrativeGenerating(true);
    try {
      const settings = await api.getAllSettings();
      const officials = await api.getOfficials();
      const punongBarangay = officials.find((o: any) => o.is_active && /punong|captain|chairman/i.test(o.position));
      const pbName = punongBarangay
        ? `${punongBarangay.first_name || ''} ${punongBarangay.last_name || ''}`.trim()
        : '';
      const pbPosition = punongBarangay?.position || 'Punong Barangay';
      const issuedDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

      const html = `
        <div style="text-align:center;margin-bottom:20px;">
          <p style="margin:0;font-size:10pt;">Republic of the Philippines</p>
          <p style="margin:0;font-size:10pt;">${settings.province || ''}</p>
          <p style="margin:0;font-size:10pt;">Municipality of ${settings.municipality || ''}</p>
          <p style="margin:4px 0;font-size:14pt;font-weight:bold;">${(settings.barangay_name || 'BARANGAY').toUpperCase()}</p>
          <p style="margin:0;font-size:10pt;font-weight:bold;text-decoration:underline;">OFFICE OF THE LUPONG TAGAPAMAYAPA</p>
        </div>

        <div style="text-align:center;margin:20px 0;">
          <h2 style="margin:0;letter-spacing:2px;">COMPLAINT CASE NARRATIVE</h2>
          <p style="margin:4px 0;font-size:10pt;">Case No. ${detailCase.case_number}</p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:11pt;margin-bottom:16px;">
          <tr><td style="padding:5px;border:1px solid #000;width:35%;font-weight:bold;">Case Number</td><td style="padding:5px;border:1px solid #000;">${detailCase.case_number}</td></tr>
          <tr><td style="padding:5px;border:1px solid #000;font-weight:bold;">Type of Case</td><td style="padding:5px;border:1px solid #000;">${detailCase.case_type}</td></tr>
          <tr><td style="padding:5px;border:1px solid #000;font-weight:bold;">Complainant</td><td style="padding:5px;border:1px solid #000;">${complainantsOf(detailCase) || '—'}</td></tr>
          <tr><td style="padding:5px;border:1px solid #000;font-weight:bold;">Respondent</td><td style="padding:5px;border:1px solid #000;">${respondentsOf(detailCase) || '—'}</td></tr>
          <tr><td style="padding:5px;border:1px solid #000;font-weight:bold;">Date Filed</td><td style="padding:5px;border:1px solid #000;">${new Date(detailCase.filed_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
          <tr><td style="padding:5px;border:1px solid #000;font-weight:bold;">Status</td><td style="padding:5px;border:1px solid #000;">${detailCase.status.toUpperCase()}</td></tr>
          ${pbName ? `<tr><td style="padding:5px;border:1px solid #000;font-weight:bold;">Official In Charge</td><td style="padding:5px;border:1px solid #000;">${pbName} — ${pbPosition}</td></tr>` : ''}
        </table>

        ${narrativeIntro ? `
          <p style="font-weight:bold;margin-bottom:4px;">I. DESCRIPTION OF THE CASE</p>
          <p style="text-indent:40px;margin-bottom:16px;white-space:pre-wrap;">${narrativeIntro}</p>
        ` : ''}

        ${narrativeDetails ? `
          <p style="font-weight:bold;margin-bottom:4px;">II. ACCOUNT / NARRATIVE</p>
          <p style="text-indent:40px;margin-bottom:16px;white-space:pre-wrap;">${narrativeDetails}</p>
        ` : ''}

        ${narrativeWitnesses ? `
          <p style="font-weight:bold;margin-bottom:4px;">III. WITNESSES</p>
          <p style="text-indent:40px;margin-bottom:16px;white-space:pre-wrap;">${narrativeWitnesses}</p>
        ` : ''}

        ${narrativeFindings ? `
          <p style="font-weight:bold;margin-bottom:4px;">IV. FINDINGS</p>
          <p style="text-indent:40px;margin-bottom:16px;white-space:pre-wrap;">${narrativeFindings}</p>
        ` : ''}

        ${narrativeRecommendation ? `
          <p style="font-weight:bold;margin-bottom:4px;">V. RECOMMENDATION</p>
          <p style="text-indent:40px;margin-bottom:16px;white-space:pre-wrap;">${narrativeRecommendation}</p>
        ` : ''}

        <p style="text-indent:40px;margin-top:16px;">
          Prepared this <strong>${issuedDate}</strong> at Barangay ${settings.barangay_name || '___________'},
          ${settings.municipality || '___________'}, ${settings.province || '___________'}.
        </p>

        ${pbName ? `
          <div style="margin-top:50px;">
            <p style="margin:0;font-weight:bold;">${pbName}</p>
            <p style="margin:0;">${pbPosition}</p>
            <p style="margin:0;font-size:10pt;">Lupong Tagapamayapa</p>
          </div>
        ` : ''}
      `;

      setNarrativeOpen(false);
      setPreviewedDocId(null);
      setCaseDocTitle(`Complaint Narrative — Case ${detailCase.case_number}`);
      setCaseDocHtml(html);
    } finally {
      setNarrativeGenerating(false);
    }
  };

  // ─── Case form handlers ────────────────────────────────────────────────

  const resetCaseForm = () => {
    setFormType('mediation');
    setFormComplainants([]);
    setFormRespondents([]);
    setFormDescription('');
    setFormFiledDate(new Date().toISOString().split('T')[0]);
  };

  const openNewCase = () => {
    setEditCase(null);
    resetCaseForm();
    setCaseDialogOpen(true);
  };

  const openEditCase = async (c: CaseRecord) => {
    setEditCase(c);
    setFormType(c.case_type);
    setFormDescription(c.description || '');
    setFormFiledDate(c.filed_date);
    // Load all parties (falls back to the legacy single-party columns for old cases)
    try {
      const parties = await api.getCaseParties(c.id);
      const complainants = parties.filter((p: any) => p.role === 'complainant' && p.resident_id).map((p: any) => ({ id: p.resident_id, name: p.name }));
      const respondents = parties.filter((p: any) => p.role === 'respondent' && p.resident_id).map((p: any) => ({ id: p.resident_id, name: p.name }));
      setFormComplainants(complainants.length || !c.complainant_id ? complainants : [{ id: c.complainant_id, name: c.complainant_name || '' }]);
      setFormRespondents(respondents.length || !c.respondent_id ? respondents : [{ id: c.respondent_id, name: c.respondent_name || '' }]);
    } catch {
      setFormComplainants(c.complainant_id ? [{ id: c.complainant_id, name: c.complainant_name || '' }] : []);
      setFormRespondents(c.respondent_id ? [{ id: c.respondent_id, name: c.respondent_name || '' }] : []);
    }
    setCaseDialogOpen(true);
  };

  const handleSaveCase = async () => {
    if (!api) return;
    setSaving(true);
    try {
      const parties = [
        ...formComplainants.map(p => ({ resident_id: p.id, role: 'complainant' })),
        ...formRespondents.map(p => ({ resident_id: p.id, role: 'respondent' })),
      ];
      const data = {
        case_type: formType,
        complainant_id: formComplainants[0]?.id ?? null,
        respondent_id: formRespondents[0]?.id ?? null,
        description: formDescription || null,
        filed_date: formFiledDate || new Date().toISOString().split('T')[0],
        parties,
      };

      if (editCase) {
        await api.updateCase(editCase.id, data);
        toast.success('Case updated');
        // Refresh detail if open
        if (detailCase?.id === editCase.id) {
          const refreshed = await api.getCase(editCase.id);
          if (refreshed) setDetailCase(refreshed);
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
    try { setDetailParties(await api.getCaseParties(c.id)); } catch { setDetailParties([]); }
    try { setCaseDocs(await api.getCaseDocuments(c.id)); } catch { setCaseDocs([]); }
    await fetchSummons(c.id);
  };

  const openResidentDetail = (residentId: number | null) => {
    if (!residentId) return;
    setResidentDetailId(residentId);
    setResidentDetailOpen(true);
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

  // ─── Search handler ────────────────────────────────────────────────────

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
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
                  <td className="px-4 py-3 truncate max-w-[160px]" title={complainantsOf(c)}>{complainantsOf(c) || <span className="text-muted-foreground">-</span>}</td>
                  <td className="px-4 py-3 truncate max-w-[160px]" title={respondentsOf(c)}>{respondentsOf(c) || <span className="text-muted-foreground">-</span>}</td>
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

            <MultiPersonSearchInput
              label="Complainants"
              selected={formComplainants}
              onAdd={(r) => setFormComplainants(prev => prev.some(p => p.id === r.id) ? prev : [...prev, { id: r.id, name: residentDisplayName(r) }])}
              onRemove={(id) => setFormComplainants(prev => prev.filter(p => p.id !== id))}
            />

            <MultiPersonSearchInput
              label="Respondents"
              selected={formRespondents}
              onAdd={(r) => setFormRespondents(prev => prev.some(p => p.id === r.id) ? prev : [...prev, { id: r.id, name: residentDisplayName(r) }])}
              onRemove={(id) => setFormRespondents(prev => prev.filter(p => p.id !== id))}
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden p-0 gap-0" closeClassName="text-white">
          {detailCase && (
            <>
              <DialogDescription className="sr-only">Case details and summons timeline</DialogDescription>

              {/* ── Gradient Banner + Case Number ── */}
              <div className="relative">
                <div
                  className="h-24 w-full"
                  style={{
                    background: detailCase.status === 'resolved'
                      ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                      : detailCase.status === 'dismissed'
                      ? 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)'
                      : detailCase.case_type === 'complaint'
                      ? 'linear-gradient(135deg, #dc2626 0%, #f97316 100%)'
                      : detailCase.case_type === 'dispute'
                      ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
                      : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                  }}
                />
                {/* Scale icon overlapping banner bottom */}
                <div className="absolute left-6 -bottom-7">
                  <div
                    className="h-14 w-14 flex items-center justify-center text-white font-bold shadow-lg border-4 border-background"
                    style={{
                      borderRadius: '22%',
                      background: detailCase.status === 'resolved'
                        ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                        : detailCase.status === 'dismissed'
                        ? 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)'
                        : detailCase.case_type === 'complaint'
                        ? 'linear-gradient(135deg, #dc2626 0%, #f97316 100%)'
                        : detailCase.case_type === 'dispute'
                        ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
                        : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                    }}
                  >
                    <Scale className="h-6 w-6" />
                  </div>
                </div>
                {/* Badges on the banner */}
                <div className="absolute right-4 bottom-3 flex items-center gap-1.5">
                  <TypeBadge type={detailCase.case_type} />
                  <StatusBadge status={detailCase.status} />
                </div>
              </div>

              {/* Spacer for icon overflow */}
              <div className="h-9" />

              <div className="px-6 pb-6 space-y-5">
                {/* Case title + date */}
                <div>
                  <DialogTitle className="text-lg font-semibold">
                    Case {detailCase.case_number}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" />
                    Filed {formatDate(detailCase.filed_date)}
                    {detailCase.resolved_date && (
                      <span className="ml-2">· Resolved {formatDate(detailCase.resolved_date)}</span>
                    )}
                  </p>
                </div>

                {/* Parties card */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    {/* Complainant */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Complainant</p>
                      <div className="flex items-start gap-2">
                        <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {detailParties.filter(p => p.role === 'complainant').length > 0 ? (
                            detailParties.filter(p => p.role === 'complainant').map(p => (
                              <button key={p.id} type="button" onClick={() => openResidentDetail(p.resident_id)}
                                className="rounded-full border bg-background px-2 py-0.5 text-sm font-medium hover:bg-accent transition-colors">
                                {p.name}
                              </button>
                            ))
                          ) : (
                            <p className="font-medium text-sm pt-1">{complainantsOf(detailCase) || 'Not specified'}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="shrink-0 flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-muted-foreground font-medium uppercase">vs</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Respondent */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Respondent</p>
                      <div className="flex items-start gap-2">
                        <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {detailParties.filter(p => p.role === 'respondent').length > 0 ? (
                            detailParties.filter(p => p.role === 'respondent').map(p => (
                              <button key={p.id} type="button" onClick={() => openResidentDetail(p.resident_id)}
                                className="rounded-full border bg-background px-2 py-0.5 text-sm font-medium hover:bg-accent transition-colors">
                                {p.name}
                              </button>
                            ))
                          ) : (
                            <p className="font-medium text-sm pt-1">{respondentsOf(detailCase) || 'Not specified'}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {detailCase.description && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Description</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{detailCase.description}</p>
                  </div>
                )}

                {/* Resolution notes */}
                {detailCase.resolution_notes && (
                  <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-4">
                    <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1.5">Resolution Notes</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{detailCase.resolution_notes}</p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={handleViewCaseDocument}>
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    Case Record
                  </Button>
                  <Button variant="outline" size="sm" onClick={openComplaintNarrative}>
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Complaint Narrative
                  </Button>
                  <Button variant="outline" size="sm" onClick={openCustomDoc}>
                    <FilePlus2 className="mr-2 h-3.5 w-3.5" />
                    Custom Document
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

                {/* ─── Saved Documents ─────────────────────────────────────── */}
                {caseDocs.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Saved Documents ({caseDocs.length})</h3>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {caseDocs.map((d) => (
                        <div key={d.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => { setPreviewedDocId(d.id); setCaseDocTitle(d.title || 'Case Document'); setCaseDocHtml(d.content_html); }}
                            className="flex flex-1 items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                          >
                            <span className="truncate font-medium">{d.title || 'Case Document'}</span>
                            <span className="shrink-0 text-muted-foreground">{formatDate(d.generated_at)}</span>
                          </button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                            title="Edit in page editor"
                            onClick={() => { setDetailOpen(false); router.push(`/documents/editor?reportId=${d.id}`); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── Summons Timeline ────────────────────────────────────── */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Summons Timeline</h3>
                    <Button variant="outline" size="sm" onClick={openNewSummon}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Summon
                    </Button>
                  </div>

                  {summons.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground rounded-lg border border-dashed">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No summons issued yet.
                    </div>
                  ) : (
                    <div className="relative pl-6">
                      {/* Vertical timeline line */}
                      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />

                      <div className="space-y-3">
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
                            <div className="rounded-lg border bg-card p-3 text-sm">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Summon #{s.summon_number}</span>
                                  <SummonStatusBadge status={s.status} />
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs gap-1"
                                    onClick={() => handleViewSummonsNotice(s)}
                                    title="Print Summons Notice"
                                  >
                                    <Printer className="h-3 w-3" />
                                    Notice
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => openEditSummon(s)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
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

      {/* ─── Case Document Preview Dialog ─────────────────────────────── */}
      <Dialog open={caseDocHtml !== null} onOpenChange={() => setCaseDocHtml(null)}>
        <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{caseDocTitle}</DialogTitle>
            <DialogDescription>Preview the case document. You can print it or save as PDF.</DialogDescription>
          </DialogHeader>
          <div className="bg-neutral-200 dark:bg-neutral-900 p-6 rounded-md overflow-auto max-h-[60vh]">
            {caseDocHtml && <PaperPreview html={caseDocHtml} />}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCaseDocHtml(null)}>Close</Button>
            <Button variant="outline" onClick={handleEditCaseDoc}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit in Page Editor
            </Button>
            <Button variant="outline" onClick={handlePrintCaseDoc} disabled={docPrinting}>
              <Printer className="mr-2 h-4 w-4" />
              {docPrinting ? 'Printing...' : 'Print'}
            </Button>
            <Button onClick={handleExportCaseDoc} disabled={docExporting}>
              <FileDown className="mr-2 h-4 w-4" />
              {docExporting ? 'Saving...' : 'Save PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Complaint Narrative Form Dialog ───────────────────────────── */}
      <Dialog open={narrativeOpen} onOpenChange={setNarrativeOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complaint Narrative — Case {detailCase?.case_number}</DialogTitle>
            <DialogDescription>
              Fill in the case narrative. The header and official in charge will be auto-filled from your barangay settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Auto-filled info banner */}
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm">Auto-filled from records</p>
              <p>Case No: <span className="font-medium text-foreground">{detailCase?.case_number}</span></p>
              <p>Complainants: <span className="font-medium text-foreground">{detailCase ? complainantsOf(detailCase) || '—' : '—'}</span></p>
              <p>Respondents: <span className="font-medium text-foreground">{detailCase ? respondentsOf(detailCase) || '—' : '—'}</span></p>
              <p>Barangay header &amp; official in charge will be pulled from settings automatically.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="narrative-intro">I. Description of the Case</Label>
              <Textarea
                id="narrative-intro"
                rows={3}
                value={narrativeIntro}
                onChange={(e) => setNarrativeIntro(e.target.value)}
                placeholder="Brief description of what the case is about..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="narrative-details">II. Account / Narrative <span className="text-destructive">*</span></Label>
              <Textarea
                id="narrative-details"
                rows={6}
                value={narrativeDetails}
                onChange={(e) => setNarrativeDetails(e.target.value)}
                placeholder="Provide a detailed account of what happened, when it happened, and how it happened..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="narrative-witnesses">III. Witnesses</Label>
              <Textarea
                id="narrative-witnesses"
                rows={2}
                value={narrativeWitnesses}
                onChange={(e) => setNarrativeWitnesses(e.target.value)}
                placeholder="List witnesses (name, address, relationship to the case)..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="narrative-findings">IV. Findings</Label>
              <Textarea
                id="narrative-findings"
                rows={3}
                value={narrativeFindings}
                onChange={(e) => setNarrativeFindings(e.target.value)}
                placeholder="Findings of the Lupong Tagapamayapa after mediation..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="narrative-recommendation">V. Recommendation</Label>
              <Textarea
                id="narrative-recommendation"
                rows={2}
                value={narrativeRecommendation}
                onChange={(e) => setNarrativeRecommendation(e.target.value)}
                placeholder="Recommended action or resolution..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNarrativeOpen(false)}>Cancel</Button>
            <Button
              onClick={handleGenerateNarrative}
              disabled={narrativeGenerating || !narrativeDetails.trim()}
            >
              {narrativeGenerating ? 'Generating...' : 'Preview Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResidentDetailDialog residentId={residentDetailId} open={residentDetailOpen} onOpenChange={setResidentDetailOpen} />

      {/* ─── Custom Document Picker ─────────────────────────────────────── */}
      <Dialog open={customDocOpen} onOpenChange={setCustomDocOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Custom Document — Case {detailCase?.case_number}</DialogTitle>
            <DialogDescription>
              Start from a template (case details are filled in automatically) or from a blank page,
              then edit it freely before printing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            <button
              type="button"
              className="w-full rounded-md border border-dashed px-3 py-2.5 text-left text-sm font-medium hover:bg-accent transition-colors"
              onClick={() => detailCase && router.push(`/documents/editor?caseId=${detailCase.id}`)}
            >
              Blank document
              <span className="block text-xs font-normal text-muted-foreground">Letterhead + case info scaffold, write the rest yourself</span>
            </button>
            {docTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="w-full rounded-md border px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                onClick={() => detailCase && router.push(`/documents/editor?caseId=${detailCase.id}&templateId=${t.id}`)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDocOpen(false)}>Cancel</Button>
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
