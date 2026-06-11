'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, FilePlus2, GitBranch, Phone, Mail, MapPin, CalendarDays, Flag, Plus, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SquircleAvatar } from '@/components/squircle-avatar';
import { ReportGenerateDialog } from '@/components/report-generate-dialog';
import { FamilyTreeView, fullGender } from '@/components/family-tree-view';
import { getAPI, type Resident, type TreeResident, type ReportTemplate, type ResidentIssue } from '@/lib/ipc';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { getGradientForId, templateVisibleOn } from '@/lib/constants';
import QRCode from 'qrcode';

interface ResidentDetailDialogProps {
  residentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: 'details' | 'family' | 'issues';
  pageKey?: string; // template visibility context of the page that opened this dialog
}

function calcAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

// View-only resident profile usable from ANY page: details, embedded family
// tree, and shortcuts to generate documents for the person.
export function ResidentDetailDialog({ residentId, open, onOpenChange, initialTab = 'details', pageKey = 'residents' }: ResidentDetailDialogProps) {
  const router = useRouter();
  const [currentId, setCurrentId] = useState<number | null>(residentId);
  const [resident, setResident] = useState<Resident | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [treeResidents, setTreeResidents] = useState<TreeResident[] | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [customDocOpen, setCustomDocOpen] = useState(false);
  const [docTemplates, setDocTemplates] = useState<ReportTemplate[]>([]);
  const [tab, setTab] = useState<string>('details');
  const [issues, setIssues] = useState<ResidentIssue[]>([]);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDetails, setIssueDetails] = useState('');
  const [issueSaving, setIssueSaving] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Reset to the requested resident each time the dialog opens
  useEffect(() => {
    if (open) {
      setCurrentId(residentId);
      setTab(initialTab);
    }
  }, [open, residentId, initialTab]);

  useEffect(() => {
    const api = getAPI() as any;
    if (!api || !currentId || !open) return;
    let cancelled = false;
    (async () => {
      const r = await api.getResident(currentId);
      if (cancelled) return;
      setResident(r || null);
      if (r?.photo_path) {
        const dataUrl = await api.getImageBase64(r.photo_path);
        if (!cancelled) setPhoto(dataUrl);
      } else {
        setPhoto(null);
      }
    })();
    return () => { cancelled = true; };
  }, [currentId, open]);

  // QR code for the resident's permanent ID (scannable by the mobile app)
  useEffect(() => {
    const uid = (resident as any)?.resident_uid;
    if (!uid) { setQrDataUrl(null); return; }
    QRCode.toDataURL(`brgy:resident:${uid}`, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [resident]);

  const printQr = async () => {
    const api = getAPI();
    if (!api || !resident || !qrDataUrl) return;
    const uid = (resident as any).resident_uid;
    const html = `
      <div style="text-align:center;padding-top:40px;">
        <img src="${qrDataUrl}" style="width:220px;height:220px;" />
        <p style="margin:12px 0 2px;font-size:14pt;font-weight:bold;">${fullName}</p>
        <p style="margin:0;font-size:9pt;color:#555;">Resident ID: ${uid}</p>
      </div>`;
    await api.printReport(html);
  };

  // Issues load whenever the resident changes
  useEffect(() => {
    const api = getAPI();
    if (!api || !currentId || !open) return;
    api.getResidentIssues(currentId).then(setIssues).catch(() => setIssues([]));
  }, [currentId, open]);

  const refreshIssues = async () => {
    const api = getAPI();
    if (!api || !currentId) return;
    setIssues(await api.getResidentIssues(currentId));
  };

  const addIssue = async () => {
    const api = getAPI();
    if (!api || !currentId || !issueTitle.trim()) return;
    setIssueSaving(true);
    try {
      await api.createResidentIssue({ resident_id: currentId, title: issueTitle.trim(), details: issueDetails.trim() || null });
      setIssueTitle('');
      setIssueDetails('');
      toast.success('Issue recorded');
      refreshIssues();
    } finally { setIssueSaving(false); }
  };

  const setIssueStatus = async (issue: ResidentIssue, status: 'open' | 'resolved') => {
    const api = getAPI();
    if (!api) return;
    await api.updateResidentIssue(issue.id, { status });
    refreshIssues();
  };

  const removeIssue = async (issue: ResidentIssue) => {
    const api = getAPI();
    if (!api) return;
    await api.deleteResidentIssue(issue.id);
    toast.success('Issue deleted');
    refreshIssues();
  };

  // Family tree data loads lazily when the tab is first opened
  useEffect(() => {
    const api = getAPI();
    if (!api || tab !== 'family' || treeResidents !== null || !open) return;
    api.getResidentsForTree().then(setTreeResidents).catch(() => setTreeResidents([]));
  }, [tab, treeResidents, open]);

  if (!resident && open && !currentId) return null;

  const fullName = resident
    ? [resident.first_name, resident.middle_name, resident.last_name, resident.suffix].filter(Boolean).join(' ')
    : '';
  const age = resident ? (resident.age ?? calcAge(resident.birth_date)) : null;
  const [c1, c2] = getGradientForId(currentId || 0);

  const badges: { label: string; show: boolean }[] = resident ? [
    { label: 'Deceased', show: resident.status === 'deceased' },
    { label: 'Senior Citizen', show: (age ?? 0) >= 60 && resident.status !== 'deceased' },
    { label: 'Indigent', show: !!resident.is_indigent },
    { label: '4Ps', show: !!(resident as any).is_4ps },
    { label: 'PWD', show: !!(resident as any).is_pwd },
    { label: 'Registered Voter', show: (resident.voter_status || '').toLowerCase() === 'registered' },
  ] : [];
  const openIssueCount = issues.filter(i => i.status === 'open').length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto p-0 gap-0" closeClassName="text-white">
          <DialogDescription className="sr-only">Resident profile details and family tree</DialogDescription>
          {/* Banner */}
          <div className="relative">
            <div className="h-20 w-full" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />
            <div className="absolute left-6 -bottom-8">
              <SquircleAvatar
                name={fullName || '?'}
                id={currentId || 0}
                size="xl"
                src={photo}
                className="border-4 border-background shadow-lg"
              />
            </div>
          </div>
          <div className="h-10" />

          <div className="px-6 pb-6 space-y-4">
            <div>
              <DialogTitle className="text-lg font-semibold">{fullName || 'Loading...'}</DialogTitle>
              {resident && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{age !== null ? `${age} yrs` : '—'} · {fullGender(resident.gender)}</span>
                  {resident.purok && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />Purok {resident.purok}</span>}
                  {resident.contact_number && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{resident.contact_number}</span>}
                  {resident.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{resident.email}</span>}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {badges.filter(b => b.show).map(b => (
                  <Badge key={b.label} variant={b.label === 'Deceased' ? 'destructive' : 'secondary'} className="text-[10px]">{b.label}</Badge>
                ))}
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="family"><GitBranch className="mr-1.5 h-3.5 w-3.5" />Family Tree</TabsTrigger>
                <TabsTrigger value="issues">
                  <Flag className={`mr-1.5 h-3.5 w-3.5 ${openIssueCount ? 'text-amber-500' : ''}`} />
                  Issues{openIssueCount > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">{openIssueCount}</span>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4">
                {resident && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <Field label="Birth Date" value={resident.birth_date ? new Date(resident.birth_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                    <Field label="Civil Status" value={resident.civil_status} />
                    <Field label="Occupation" value={resident.occupation} />
                    <Field label="Address" value={resident.address} />
                    <Field label="Religion" value={(resident as any).religion} />
                    <Field label="Citizenship" value={(resident as any).citizenship} />
                    <Field label="Educational Attainment" value={(resident as any).educational_attainment} />
                    <Field label="Blood Type" value={resident.blood_type} />
                    <Field label="Voter Status" value={resident.voter_status} />
                    <Field label="PhilSys Card No." value={(resident as any).philsys_card_no} />
                    {!!(resident as any).is_pwd && <Field label="PWD Note" value={(resident as any).pwd_note} />}
                    {resident.status === 'deceased' && (
                      <Field label="Date of Death" value={(resident as any).death_date ? new Date((resident as any).death_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                    )}
                  </div>
                )}

                {/* Permanent resident ID + QR (scannable by the mobile partner app) */}
                {qrDataUrl && (
                  <div className="mt-4 flex items-center gap-4 rounded-lg border p-3">
                    <img src={qrDataUrl} alt="Resident QR code" className="h-24 w-24 shrink-0 rounded" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resident ID</p>
                      <p className="break-all font-mono text-xs">{(resident as any)?.resident_uid}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">Scan with the mobile app to open this profile instantly.</p>
                      <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={printQr}>
                        Print QR Card
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="family" className="mt-4">
                {treeResidents === null ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Loading family tree...</p>
                ) : resident ? (
                  <FamilyTreeView
                    resident={resident}
                    allResidents={treeResidents}
                    onRecenter={(id) => setCurrentId(id)}
                    onPersonClick={(id) => { if (id !== currentId) setCurrentId(id); }}
                    height="380px"
                    compact
                  />
                ) : null}
                <p className="mt-2 text-[10px] text-muted-foreground">Click a family member to view their profile here.</p>
              </TabsContent>

              <TabsContent value="issues" className="mt-4 space-y-4">
                {/* Record a new issue */}
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record an issue</p>
                  <Input
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    placeholder="Short title (e.g., Repeated noise complaints)"
                    className="h-8"
                  />
                  <Textarea
                    value={issueDetails}
                    onChange={(e) => setIssueDetails(e.target.value)}
                    placeholder="Details, dates, what happened... (optional)"
                    rows={2}
                  />
                  <Button size="sm" onClick={addIssue} disabled={issueSaving || !issueTitle.trim()}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />{issueSaving ? 'Saving...' : 'Add Issue'}
                  </Button>
                </div>

                {/* Issue list */}
                {issues.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No issues recorded for this resident.</p>
                ) : (
                  <div className="space-y-2">
                    {issues.map((issue) => (
                      <div key={issue.id} className={`rounded-lg border p-3 ${issue.status === 'open' ? 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20' : 'opacity-70'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{issue.title}</p>
                            {issue.details && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{issue.details}</p>}
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {issue.status === 'open' ? 'Open' : 'Resolved'} · recorded {new Date(issue.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                              {issue.resolved_at && ` · resolved ${new Date(issue.resolved_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-0.5">
                            {issue.status === 'open' ? (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark resolved" onClick={() => setIssueStatus(issue, 'resolved')}>
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Reopen" onClick={() => setIssueStatus(issue, 'open')}>
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete" onClick={() => removeIssue(issue)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button size="sm" onClick={() => setGenerateOpen(true)} disabled={!resident}>
                <FileText className="mr-2 h-3.5 w-3.5" />Generate Document
              </Button>
              <Button
                variant="outline" size="sm" disabled={!resident}
                onClick={async () => {
                  const api = getAPI();
                  if (!api) return;
                  try { setDocTemplates((await api.getTemplates()).filter(t => templateVisibleOn(t, pageKey))); } catch { setDocTemplates([]); }
                  setCustomDocOpen(true);
                }}
              >
                <FilePlus2 className="mr-2 h-3.5 w-3.5" />Custom Document
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => { onOpenChange(false); router.push(`/family-tree?residentId=${currentId}`); }}
                disabled={!currentId}
              >
                <GitBranch className="mr-2 h-3.5 w-3.5" />Open Full Family Tree
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {resident && (
        <ReportGenerateDialog
          open={generateOpen}
          onClose={() => setGenerateOpen(false)}
          resident={resident}
          pageKey={pageKey}
        />
      )}

      {/* Custom document: start from a template (auto-filled) or blank, then edit freely */}
      <Dialog open={customDocOpen} onOpenChange={setCustomDocOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Custom Document — {fullName}</DialogTitle>
          <DialogDescription>
            Start from a template with this resident&apos;s details filled in, or from a blank page.
            The document is saved and can be reopened, edited, and reprinted anytime from Saved Documents.
          </DialogDescription>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            <button
              type="button"
              className="w-full rounded-md border border-dashed px-3 py-2.5 text-left text-sm font-medium hover:bg-accent transition-colors"
              onClick={() => { onOpenChange(false); setCustomDocOpen(false); router.push(`/documents/editor?residentId=${currentId}`); }}
            >
              Blank document
              <span className="block text-xs font-normal text-muted-foreground">Letterhead + resident info scaffold, write the rest yourself</span>
            </button>
            {docTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="w-full rounded-md border px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                onClick={() => { onOpenChange(false); setCustomDocOpen(false); router.push(`/documents/editor?residentId=${currentId}&templateId=${t.id}`); }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
