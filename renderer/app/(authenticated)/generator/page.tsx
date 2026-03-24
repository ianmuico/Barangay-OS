'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Search, FileText, Download, Printer } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAPI, type Resident, type ReportTemplate } from '@/lib/ipc';
import { getGradientForId, getInitials } from '@/lib/constants';
import { toast } from 'sonner';

export default function GeneratorPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resident[]>([]);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(new Set());
  const [generatedReports, setGeneratedReports] = useState<{ templateName: string; html: string }[]>([]);
  const [activePreviewIdx, setActivePreviewIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Template selection is preserved — no reset
  };

  const toggleTemplate = (id: number) => {
    setSelectedTemplateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!selectedResident || selectedTemplateIds.size === 0) {
      toast.error('Select a resident and at least one template');
      return;
    }
    const api = getAPI();
    if (!api) return;
    setGenerating(true);
    try {
      const ids = Array.from(selectedTemplateIds);
      if (ids.length === 1) {
        const result = await api.generateReport(ids[0], selectedResident.id);
        if (result.success && result.html) {
          const tpl = templates.find(t => t.id === ids[0]);
          setGeneratedReports([{ templateName: tpl?.name || 'Report', html: result.html }]);
          setActivePreviewIdx(0);
          toast.success('Report generated');
        } else {
          toast.error(result.error || 'Failed');
        }
      } else {
        const result = await api.generateMultiReport(ids, selectedResident.id);
        if (result.success && result.reports) {
          setGeneratedReports(result.reports);
          setActivePreviewIdx(0);
          toast.success(`${result.reports.length} reports generated`);
        } else {
          toast.error(result.error || 'Failed');
        }
      }
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

  const buildName = (r: Resident) => [r.first_name, r.last_name, r.suffix].filter(Boolean).join(' ');
  const activeReport = generatedReports[activePreviewIdx];

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

            <Button className="w-full" onClick={handleGenerate} disabled={!selectedResident || selectedTemplateIds.size === 0 || generating}>
              <FileText className="mr-2 h-4 w-4" />
              {generating ? 'Generating...' : `Generate ${selectedTemplateIds.size > 1 ? selectedTemplateIds.size + ' Reports' : 'Report'}`}
            </Button>
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
              <div className="relative rounded-md border bg-white p-8 min-h-[500px] text-black overflow-hidden" style={{ fontFamily: "'Times New Roman', serif", fontSize: '12pt', lineHeight: 1.6 }}>
                {logoBase64 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                    <img src={logoBase64} alt="" className="w-[300px] h-[300px] object-contain opacity-[0.06]" />
                  </div>
                )}
                <div className="relative z-10" dangerouslySetInnerHTML={{ __html: activeReport.html }} />
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
