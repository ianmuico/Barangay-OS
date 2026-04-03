'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Search, FileText, Download, Printer, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAPI, type Resident, type ReportTemplate } from '@/lib/ipc';
import { getGradientForId, getInitials } from '@/lib/constants';
import { toast } from 'sonner';

// Convert field_name to readable label
function fieldToLabel(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface TemplateInputGroup {
  templateId: number;
  templateName: string;
  fields: string[];
}

export default function GeneratorPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resident[]>([]);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(new Set());
  const [generatedReports, setGeneratedReports] = useState<{ templateId: number; templateName: string; html: string }[]>([]);
  const [activePreviewIdx, setActivePreviewIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Input fields state
  const [inputGroups, setInputGroups] = useState<TemplateInputGroup[]>([]);
  const [sharedFields, setSharedFields] = useState<string[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showInputs, setShowInputs] = useState(false);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getTemplates().then(setTemplates);
    api.getLogoBase64().then(setLogoBase64);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const api = getAPI();
      if (!api) return;
      setResults(await api.searchResidents(value.trim()));
    }, 300);
  }, []);

  const selectResident = (resident: Resident) => {
    setSelectedResident(resident);
    setResults([]);
    setQuery('');
    setGeneratedReports([]);
    setShowInputs(false);
  };

  const toggleTemplate = (id: number) => {
    setSelectedTemplateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Step 1: Collect input fields from selected templates
  const handlePrepareGenerate = async () => {
    if (!selectedResident || selectedTemplateIds.size === 0) {
      toast.error('Select a resident and at least one template');
      return;
    }
    const api = getAPI();
    if (!api) return;

    const groups: TemplateInputGroup[] = [];
    const fieldCount: Record<string, number> = {};

    for (const id of Array.from(selectedTemplateIds)) {
      let fields: string[] = [];
      try {
        fields = await api.getInputFields(id);
      } catch {
        const tpl = templates.find(t => t.id === id);
        if (tpl) {
          const regex = /\{\{input:(\w+)\}\}/g;
          let match;
          while ((match = regex.exec(tpl.content_html)) !== null) {
            if (!fields.includes(match[1])) fields.push(match[1]);
          }
        }
      }
      const tpl = templates.find(t => t.id === id);
      groups.push({
        templateId: id,
        templateName: tpl?.name || `Template ${id}`,
        fields,
      });
      for (const f of fields) {
        fieldCount[f] = (fieldCount[f] || 0) + 1;
      }
    }

    const shared = Object.entries(fieldCount)
      .filter(([, count]) => count > 1)
      .map(([field]) => field);

    const hasAnyFields = groups.some(g => g.fields.length > 0);

    if (hasAnyFields) {
      setInputGroups(groups);
      setSharedFields(shared);
      setInputValues({});
      setShowInputs(true);
    } else {
      await doGenerate({});
    }
  };

  // Step 2: Generate reports with input values (one at a time so each gets inputValues)
  const doGenerate = async (values: Record<string, string>) => {
    if (!selectedResident) return;
    const api = getAPI();
    if (!api) return;
    setGenerating(true);
    try {
      const ids = Array.from(selectedTemplateIds);
      const reports: { templateId: number; templateName: string; html: string }[] = [];
      for (const tid of ids) {
        const result = await api.generateReport(tid, selectedResident.id, values);
        if (result.success && result.html) {
          const tpl = templates.find(t => t.id === tid);
          reports.push({ templateId: tid, templateName: tpl?.name || 'Report', html: result.html });
        }
      }
      setGeneratedReports(reports);
      setActivePreviewIdx(0);
      setShowInputs(false);
      if (reports.length === 1) toast.success('Report generated');
      else toast.success(`${reports.length} reports generated`);
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    if (generatedReports.length === 0 || !selectedResident) return;
    const api = getAPI();
    if (!api) return;
    setExporting(true);
    try {
      const filename = `reports-${selectedResident.last_name}-${Date.now()}`;
      if (generatedReports.length === 1) {
        const result = await api.exportPDF(generatedReports[0].html, filename);
        if (result.success) toast.success('PDF saved');
        else toast.error(result.error || 'Failed');
      } else {
        const result = await api.exportMultiPDF(generatedReports.map(r => r.html), filename);
        if (result.success) toast.success(`PDF saved with ${generatedReports.length} pages`);
        else toast.error(result.error || 'Failed');
      }
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async () => {
    if (generatedReports.length === 0) return;
    const api = getAPI();
    if (!api) return;
    setPrinting(true);
    try {
      const combinedHtml = generatedReports.map((r, i) => {
        const pb = i < generatedReports.length - 1 ? '<div style="page-break-after:always"></div>' : '';
        return r.html + pb;
      }).join('\n');
      const result = await api.printReport(combinedHtml);
      if (result.success) toast.success('Print dialog opened');
      else toast.error(result.error || 'Failed');
    } finally {
      setPrinting(false);
    }
  };

  const handleEditTemplate = (templateId: number) => {
    router.push(`/templates?edit=${templateId}`);
  };

  const buildName = (r: Resident) => [r.first_name, r.last_name, r.suffix].filter(Boolean).join(' ');
  const activeReport = generatedReports[activePreviewIdx];
  const sharedSet = new Set(sharedFields);

  return (
    <div className="space-y-6">
      <PageHeader title="Report Generator" description="Search for a resident, choose templates, and generate reports" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Select Resident</CardTitle>
            <CardDescription>Search by name</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search residents..." className="pl-9" value={query} onChange={(e) => handleSearch(e.target.value)} />
            </div>

            {results.length > 0 && (
              <div className="rounded-md border max-h-60 overflow-y-auto">
                {results.map((r) => {
                  const [c1, c2] = getGradientForId(r.id);
                  const initials = getInitials(`${r.first_name} ${r.last_name}`);
                  return (
                    <button key={r.id} className="w-full flex items-center gap-3 text-left px-3 py-2 hover:bg-accent text-sm transition-colors border-b last:border-b-0" onClick={() => selectResident(r)}>
                      <div className="flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ width: 32, height: 32, borderRadius: '22%', background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials}</div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{buildName(r)}</p>
                        <p className="text-xs text-muted-foreground">Age {r.age ?? '—'} · Purok {r.purok || '—'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedResident && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  {(() => {
                    const [c1, c2] = getGradientForId(selectedResident.id);
                    const initials = getInitials(`${selectedResident.first_name} ${selectedResident.last_name}`);
                    return (<div className="flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ width: 36, height: 36, borderRadius: '22%', background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials}</div>);
                  })()}
                  <div>
                    <p className="text-sm font-semibold">{buildName(selectedResident)}</p>
                    <p className="text-xs text-muted-foreground">Age {selectedResident.age ?? '—'} · Purok {selectedResident.purok || '—'} · {selectedResident.gender}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Input fields step */}
            {showInputs ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Fill in the required fields before generating.
                  {sharedFields.length > 0 && ' Shared fields are used across all selected reports.'}
                </p>

                {/* Shared fields first */}
                {sharedFields.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shared fields</p>
                      <Badge variant="secondary" className="text-[10px]">
                        Used in {inputGroups.filter(g => g.fields.some(f => sharedSet.has(f))).length} reports
                      </Badge>
                    </div>
                    <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                      {sharedFields.map((field) => (
                        <div key={field} className="space-y-1">
                          <Label className="text-xs">{fieldToLabel(field)}</Label>
                          <Input
                            value={inputValues[field] || ''}
                            onChange={(e) => setInputValues(prev => ({ ...prev, [field]: e.target.value }))}
                            placeholder={`Enter ${fieldToLabel(field).toLowerCase()}`}
                            className="h-9"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-template unique fields */}
                {inputGroups.map((group) => {
                  const uniqueFields = group.fields.filter(f => !sharedSet.has(f));
                  if (uniqueFields.length === 0) return null;
                  return (
                    <div key={group.templateId} className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {group.templateName}
                      </p>
                      <div className="rounded-lg border p-3 space-y-3">
                        {uniqueFields.map((field) => (
                          <div key={`${group.templateId}-${field}`} className="space-y-1">
                            <Label className="text-xs">{fieldToLabel(field)}</Label>
                            <Input
                              value={inputValues[field] || ''}
                              onChange={(e) => setInputValues(prev => ({ ...prev, [field]: e.target.value }))}
                              placeholder={`Enter ${fieldToLabel(field).toLowerCase()}`}
                              className="h-9"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowInputs(false)} className="flex-1">Back</Button>
                  <Button onClick={() => doGenerate(inputValues)} disabled={generating} className="flex-1">
                    {generating ? 'Generating...' : 'Generate'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Templates <span className="text-muted-foreground text-xs">({selectedTemplateIds.size} selected)</span></Label>
                  <ScrollArea className="h-40 rounded-md border">
                    <div className="p-2 space-y-1">
                      {templates.map((t) => (
                        <label key={t.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer transition-colors">
                          <Checkbox checked={selectedTemplateIds.has(t.id)} onCheckedChange={() => toggleTemplate(t.id)} />
                          <span className="truncate">{t.name}</span>
                        </label>
                      ))}
                      {templates.length === 0 && <p className="text-xs text-muted-foreground p-2">No templates yet.</p>}
                    </div>
                  </ScrollArea>
                </div>

                <Button className="w-full" onClick={handlePrepareGenerate} disabled={!selectedResident || selectedTemplateIds.size === 0 || generating}>
                  <FileText className="mr-2 h-4 w-4" />
                  {generating ? 'Generating...' : `Generate ${selectedTemplateIds.size > 1 ? selectedTemplateIds.size + ' Reports' : 'Report'}`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Preview</CardTitle>
              <CardDescription>{activeReport ? activeReport.templateName : 'Generated report output'}</CardDescription>
            </div>
            {generatedReports.length > 0 && (
              <div className="flex gap-2">
                {activeReport && (
                  <Button variant="ghost" size="sm" onClick={() => handleEditTemplate(activeReport.templateId)} title="Edit this template">
                    <Pencil className="mr-2 h-4 w-4" />Edit Template
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={printing}>
                  <Printer className="mr-2 h-4 w-4" />{printing ? 'Printing...' : 'Print All'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={exporting}>
                  <Download className="mr-2 h-4 w-4" />{exporting ? 'Saving...' : 'Save PDF'}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {generatedReports.length > 1 && (
              <div className="flex gap-1 mb-4 flex-wrap">
                {generatedReports.map((r, i) => (
                  <Button key={i} variant={i === activePreviewIdx ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setActivePreviewIdx(i)}>
                    {r.templateName}
                  </Button>
                ))}
              </div>
            )}
            {activeReport ? (
              <div className="bg-neutral-100 dark:bg-neutral-900 p-6 rounded-md overflow-auto max-h-[70vh]">
                <div className="relative mx-auto bg-white text-black border border-neutral-300 shadow-sm overflow-hidden" style={{ width: '794px', minHeight: '1123px', padding: '96px 72px', fontFamily: "'Times New Roman', Times, serif", fontSize: '12pt', lineHeight: 1.6 }}>
                  {logoBase64 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                      <img src={logoBase64} alt="" className="w-[300px] h-[300px] object-contain opacity-[0.06]" />
                    </div>
                  )}
                  <div className="relative z-10" dangerouslySetInnerHTML={{ __html: activeReport.html }} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-[500px] text-muted-foreground text-sm">
                Select a resident and templates, then generate reports.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
