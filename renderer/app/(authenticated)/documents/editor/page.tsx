'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, FileDown, Printer, Save, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getAPI, type Official, type PaperSettings } from '@/lib/ipc';
import { DEFAULT_PAPER, PAPER_SIZES, parsePaperJson } from '@/lib/paper';
import { DocumentEditor } from '@/components/document-editor/document-editor';
import { PaperSetupDialog } from '@/components/document-editor/paper-setup-dialog';
import {
  resolveCaseDocumentHtml, blankCaseDocumentHtml, type CaseDocContext,
  resolveResidentDocumentHtml, blankResidentDocumentHtml, type PreviewContext,
  resolveBusinessDocumentHtml, blankBusinessDocumentHtml, type BusinessDocContext,
} from '@/components/document-editor/serialize';

// Unified one-off document editor. Three ways in:
//   ?reportId=N                      → edit a previously saved document (updates in place)
//   ?caseId=N[&templateId=T|draft=1] → new document for a case
//   ?residentId=N[&templateId=T]     → new document for a resident
//   ?businessId=N[&templateId=T]     → new document for a business
// Documents save explicitly (Save button) and automatically on print/export,
// so they can always be revisited, edited, and reprinted later.
function DocumentEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportId = searchParams.get('reportId') ? Number(searchParams.get('reportId')) : null;
  const caseId = searchParams.get('caseId') ? Number(searchParams.get('caseId')) : null;
  const residentId = searchParams.get('residentId') ? Number(searchParams.get('residentId')) : null;
  const businessId = searchParams.get('businessId') ? Number(searchParams.get('businessId')) : null;
  const templateId = searchParams.get('templateId') ? Number(searchParams.get('templateId')) : null;
  const isDraft = searchParams.get('draft') === '1';

  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [paper, setPaper] = useState<PaperSettings>(DEFAULT_PAPER);
  const [paperOpen, setPaperOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  // Once saved, further saves update the same record
  const [savedId, setSavedId] = useState<number | null>(reportId);
  const linkRef = useRef<{ case_id: number | null; resident_id: number | null; business_id: number | null }>({ case_id: caseId, resident_id: residentId, business_id: businessId });
  const lastSavedRef = useRef('');
  const backHref = caseId ? '/cases' : businessId ? '/businesses' : '/documents';

  useEffect(() => {
    const api = getAPI() as any;
    if (!api) return;
    (async () => {
      // ── Edit an existing saved document ──
      if (reportId) {
        const doc = await api.getDocument(reportId);
        if (!doc) {
          toast.error('Document not found');
          router.push('/documents');
          return;
        }
        linkRef.current = { case_id: doc.case_id, resident_id: doc.resident_id, business_id: (doc as any).business_id ?? null };
        setTitle(doc.title || doc.template_name || 'Document');
        setInitialContent(doc.content_html);
        setEditorHtml(doc.content_html);
        lastSavedRef.current = doc.content_html;
        setLoaded(true);
        return;
      }

      const [barangay, barangayAddress, municipality, province, headerTemplate, logo, officials] = await Promise.all([
        api.getSetting('barangay_name'),
        api.getSetting('barangay_address'),
        api.getSetting('municipality'),
        api.getSetting('province'),
        api.getSetting('header_template'),
        api.getLogoBase64(),
        api.getOfficials().then((list: Official[]) => list.filter(o => o.is_active)).catch(() => [] as Official[]),
      ]);
      const baseCtx: PreviewContext = {
        barangay: barangay || '',
        barangayAddress: barangayAddress || '',
        municipality: municipality || '',
        province: province || '',
        headerTemplate: headerTemplate || null,
        logoDataUrl: logo,
        officials,
      };

      let html = '';
      let docTitle = 'Document';

      // ── New case document ──
      if (caseId) {
        const caseRecord = await api.getCase(caseId);
        if (!caseRecord) {
          toast.error('Case not found');
          router.push('/cases');
          return;
        }
        docTitle = `Case ${caseRecord.case_number}`;

        if (isDraft) {
          try {
            const draft = JSON.parse(sessionStorage.getItem('caseDocDraft') || 'null');
            if (draft?.html) {
              if (draft.reportId) setSavedId(draft.reportId);
              setTitle(draft.title || docTitle);
              setInitialContent(draft.html);
              setEditorHtml(draft.html);
              lastSavedRef.current = draft.reportId ? draft.html : '';
              setLoaded(true);
              return;
            }
          } catch { /* fall through */ }
        }

        const ctx: CaseDocContext = {
          ...baseCtx,
          caseNumber: caseRecord.case_number,
          caseType: caseRecord.case_type,
          caseStatus: caseRecord.status,
          filedDate: caseRecord.filed_date,
          caseDescription: caseRecord.description || '',
          complainants: caseRecord.complainant_names || caseRecord.complainant_name || '',
          respondents: caseRecord.respondent_names || caseRecord.respondent_name || '',
        };
        if (templateId) {
          const tpl = await api.getTemplate(templateId);
          if (tpl) {
            html = resolveCaseDocumentHtml(tpl.content_html, ctx);
            setPaper(parsePaperJson(tpl.paper_json));
            docTitle = `${tpl.name} — Case ${caseRecord.case_number}`;
          } else {
            html = blankCaseDocumentHtml(ctx);
          }
        } else {
          html = blankCaseDocumentHtml(ctx);
        }
      }
      // ── New resident document ──
      else if (residentId) {
        const resident = await api.getResident(residentId);
        if (!resident) {
          toast.error('Resident not found');
          router.push('/residents');
          return;
        }
        const residentName = [resident.first_name, resident.last_name].filter(Boolean).join(' ');
        docTitle = `Custom Document — ${residentName}`;
        if (templateId) {
          const tpl = await api.getTemplate(templateId);
          if (tpl) {
            html = resolveResidentDocumentHtml(tpl.content_html, resident, baseCtx);
            setPaper(parsePaperJson(tpl.paper_json));
            docTitle = `${tpl.name} — ${residentName}`;
          } else {
            html = blankResidentDocumentHtml(resident, baseCtx);
          }
        } else {
          html = blankResidentDocumentHtml(resident, baseCtx);
        }
      }
      // ── New business document ──
      else if (businessId) {
        const allBusinesses = await api.getBusinesses({});
        const business = allBusinesses.find((b: any) => b.id === businessId);
        if (!business) {
          toast.error('Business not found');
          router.push('/businesses');
          return;
        }
        const ownerList = await api.getBusinessOwners(businessId);
        const ownerNames = ownerList.map((o: any) => o.name).filter(Boolean).join(', ');
        const firstResidentOwner = ownerList.find((o: any) => o.resident_id);
        const primaryResidentOwner = firstResidentOwner ? await api.getResident(firstResidentOwner.resident_id) : null;

        const ctx: BusinessDocContext = {
          ...baseCtx,
          business,
          ownerNames,
          primaryResidentOwner,
        };
        docTitle = `Custom Document — ${business.name}`;
        if (templateId) {
          const tpl = await api.getTemplate(templateId);
          if (tpl) {
            html = resolveBusinessDocumentHtml(tpl.content_html, ctx);
            setPaper(parsePaperJson(tpl.paper_json));
            docTitle = `${tpl.name} — ${business.name}`;
          } else {
            html = blankBusinessDocumentHtml(ctx);
          }
        } else {
          html = blankBusinessDocumentHtml(ctx);
        }
      } else {
        toast.error('No case, resident, business, or document selected');
        router.push('/documents');
        return;
      }

      setTitle(docTitle);
      setInitialContent(html);
      setEditorHtml(html);
      setLoaded(true);
    })();
  }, [reportId, caseId, residentId, businessId, templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDocument = async (showToast: boolean): Promise<boolean> => {
    const api = getAPI();
    if (!api) return false;
    if (editorHtml === lastSavedRef.current && savedId) {
      if (showToast) toast.info('Already saved');
      return true;
    }
    try {
      const id = await api.saveDocument({
        id: savedId || undefined,
        case_id: linkRef.current.case_id,
        resident_id: linkRef.current.resident_id,
        business_id: linkRef.current.business_id,
        title: title.trim() || 'Document',
        content_html: editorHtml,
      });
      setSavedId(id);
      lastSavedRef.current = editorHtml;
      if (showToast) toast.success('Document saved — find it again under Saved Documents');
      return true;
    } catch (err: any) {
      if (showToast) toast.error(err?.message || 'Save failed');
      return false;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await saveDocument(true); } finally { setSaving(false); }
  };

  const handlePrint = async () => {
    const api = getAPI();
    if (!api) return;
    setWorking(true);
    try {
      await saveDocument(false);
      const result = await api.printReport(editorHtml, paper);
      if (result.success) toast.success('Print dialog opened');
      else toast.error(result.error || 'Print failed');
    } finally { setWorking(false); }
  };

  const handleExport = async () => {
    const api = getAPI();
    if (!api) return;
    setWorking(true);
    try {
      await saveDocument(false);
      const filename = (title || 'document').replace(/[^a-zA-Z0-9]+/g, '_');
      const result = await api.exportPDF(editorHtml, filename, paper);
      if (result.success) toast.success('PDF saved');
      else toast.error(result.error || 'Export failed');
    } finally { setWorking(false); }
  };

  if (!loaded) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Preparing document...</div>;
  }

  const isDirty = editorHtml !== lastSavedRef.current || !savedId;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.push(backHref)} title="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 w-80 font-medium"
          placeholder="Document title"
        />
        <Button variant="outline" size="sm" onClick={() => setPaperOpen(true)}>
          <Settings2 className="mr-2 h-4 w-4" />
          {PAPER_SIZES[paper.size].label.split(' (')[0]} · {paper.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || working}>
            {!isDirty ? (<><Check className="mr-2 h-4 w-4 text-green-600" />Saved</>) : (<><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save'}</>)}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={working}>
            <Printer className="mr-2 h-4 w-4" />Print
          </Button>
          <Button size="sm" onClick={handleExport} disabled={working}>
            <FileDown className="mr-2 h-4 w-4" />Save PDF
          </Button>
        </div>
      </div>

      <DocumentEditor
        content={initialContent}
        onChange={setEditorHtml}
        paper={paper}
        previewHtml={null}
        onEditLetterhead={() => router.push('/settings/barangay')}
        hideSidebar
      />

      <PaperSetupDialog open={paperOpen} onOpenChange={setPaperOpen} paper={paper} onChange={setPaper} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
      <DocumentEditorPage />
    </Suspense>
  );
}
