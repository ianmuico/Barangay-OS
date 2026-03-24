'use client';

import { useEffect, useState } from 'react';
import { FileDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { getAPI, type Resident, type ReportTemplate } from '@/lib/ipc';
import { toast } from 'sonner';

interface ReportGenerateDialogProps {
  open: boolean;
  onClose: () => void;
  resident: Resident;
}

// Convert field_name to readable label
function fieldToLabel(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function ReportGenerateDialog({ open, onClose, resident }: ReportGenerateDialogProps) {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [generatedReports, setGeneratedReports] = useState<{ templateName: string; html: string }[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [generating, setGenerating] = useState(false);

  // Input fields state
  const [inputFields, setInputFields] = useState<string[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showInputs, setShowInputs] = useState(false);

  useEffect(() => {
    if (open) {
      const api = getAPI();
      if (!api) return;
      api.getTemplates().then(setTemplates);
      setGeneratedReports([]);
      setSelectedIds(new Set());
      setInputFields([]);
      setInputValues({});
      setShowInputs(false);
    }
  }, [open]);

  const toggleTemplate = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Check for input fields when user clicks generate
  const handlePrepareGenerate = async () => {
    if (selectedIds.size === 0) { toast.error('Select at least one template'); return; }
    const api = getAPI();
    if (!api) return;

    // Collect all input fields from selected templates
    const allFields: string[] = [];
    for (const id of Array.from(selectedIds)) {
      const fields = await api.getInputFields(id);
      for (const f of fields) {
        if (!allFields.includes(f)) allFields.push(f);
      }
    }

    if (allFields.length > 0) {
      setInputFields(allFields);
      setInputValues({});
      setShowInputs(true);
    } else {
      await doGenerate({});
    }
  };

  const doGenerate = async (values: Record<string, string>) => {
    const api = getAPI();
    if (!api) return;
    setGenerating(true);
    try {
      const ids = Array.from(selectedIds);
      if (ids.length === 1) {
        const result = await api.generateReport(ids[0], resident.id, values);
        if (result.success && result.html) {
          const tpl = templates.find(t => t.id === ids[0]);
          setGeneratedReports([{ templateName: tpl?.name || 'Report', html: result.html }]);
          setActiveIdx(0);
          toast.success('Report generated');
        }
      } else {
        // For multi-template, generate each with the same input values
        const results: { templateName: string; html: string }[] = [];
        for (const tid of ids) {
          const result = await api.generateReport(tid, resident.id, values);
          if (result.success && result.html) {
            const tpl = templates.find(t => t.id === tid);
            results.push({ templateName: tpl?.name || 'Report', html: result.html });
          }
        }
        setGeneratedReports(results);
        setActiveIdx(0);
        toast.success(`${results.length} reports generated`);
      }
      setShowInputs(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    if (generatedReports.length === 0) return;
    const api = getAPI();
    if (!api) return;
    const filename = `${resident.last_name}_${resident.first_name}_reports`;
    if (generatedReports.length === 1) {
      const result = await api.exportPDF(generatedReports[0].html, filename);
      if (result.success) toast.success('PDF saved');
      else toast.error(result.error || 'Failed');
    } else {
      const result = await api.exportMultiPDF(generatedReports.map(r => r.html), filename);
      if (result.success) toast.success('PDF saved');
      else toast.error(result.error || 'Failed');
    }
  };

  const handlePrint = async () => {
    if (generatedReports.length === 0) return;
    const api = getAPI();
    if (!api) return;
    const combinedHtml = generatedReports.map((r, i) => {
      const pb = i < generatedReports.length - 1 ? '<div style="page-break-after:always"></div>' : '';
      return r.html + pb;
    }).join('\n');
    const result = await api.printReport(combinedHtml);
    if (result.success) toast.success('Print dialog opened');
    else toast.error(result.error || 'Failed');
  };

  const fullName = [resident.first_name, resident.middle_name, resident.last_name, resident.suffix].filter(Boolean).join(' ');
  const activeReport = generatedReports[activeIdx];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Reports for {fullName}</DialogTitle>
          <DialogDescription>Select one or more templates to generate.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input fields step */}
          {showInputs ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Fill in the custom fields for this report:
              </p>
              <div className="space-y-3">
                {inputFields.map((field) => (
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
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowInputs(false)}>Back</Button>
                <Button onClick={() => doGenerate(inputValues)} disabled={generating} className="flex-1">
                  {generating ? 'Generating...' : 'Generate Report'}
                </Button>
              </div>
            </div>
          ) : generatedReports.length === 0 ? (
            <>
              <ScrollArea className="h-48 rounded-md border">
                <div className="p-2 space-y-1">
                  {templates.map((t) => (
                    <label key={t.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer transition-colors">
                      <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleTemplate(t.id)} />
                      <span>{t.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <Button onClick={handlePrepareGenerate} disabled={generating || selectedIds.size === 0} className="w-full">
                {generating ? 'Generating...' : `Generate ${selectedIds.size > 1 ? selectedIds.size + ' Reports' : 'Report'}`}
              </Button>
            </>
          ) : (
            <>
              {generatedReports.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  {generatedReports.map((r, i) => (
                    <Button key={i} variant={i === activeIdx ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setActiveIdx(i)}>
                      {r.templateName}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">{activeReport?.templateName}</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />Print All
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF}>
                    <FileDown className="mr-2 h-4 w-4" />Save PDF
                  </Button>
                </div>
              </div>
              {activeReport && (
                <div className="bg-neutral-100 dark:bg-neutral-900 p-6 rounded-md overflow-auto max-h-[60vh]">
                  <div className="mx-auto bg-white text-black border border-neutral-300 shadow-sm" style={{ width: '794px', minHeight: '1123px', padding: '96px 72px', fontFamily: "'Times New Roman', Times, serif", fontSize: '12pt', lineHeight: 1.6 }}>
                    <div dangerouslySetInnerHTML={{ __html: activeReport.html }} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
