'use client';

import { useEffect, useState } from 'react';
import { FileDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

interface TemplateInputGroup {
  templateId: number;
  templateName: string;
  fields: string[];
}

export function ReportGenerateDialog({ open, onClose, resident }: ReportGenerateDialogProps) {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [generatedReports, setGeneratedReports] = useState<{ templateName: string; html: string }[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [generating, setGenerating] = useState(false);

  // Input fields state — grouped by template
  const [inputGroups, setInputGroups] = useState<TemplateInputGroup[]>([]);
  const [sharedFields, setSharedFields] = useState<string[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showInputs, setShowInputs] = useState(false);

  useEffect(() => {
    if (open) {
      const api = getAPI();
      if (!api) return;
      api.getTemplates().then(setTemplates);
      setGeneratedReports([]);
      setSelectedIds(new Set());
      setInputGroups([]);
      setSharedFields([]);
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

  // Collect input fields grouped by template, identify shared fields
  const handlePrepareGenerate = async () => {
    if (selectedIds.size === 0) { toast.error('Select at least one template'); return; }
    const api = getAPI();
    if (!api) return;

    const groups: TemplateInputGroup[] = [];
    const fieldCount: Record<string, number> = {};

    try {
      for (const id of Array.from(selectedIds)) {
        let fields: string[] = [];
        try {
          fields = await api.getInputFields(id);
        } catch {
          // If getInputFields fails, fall back to parsing template content directly
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
    } catch (err) {
      console.error('Failed to get input fields:', err);
    }

    // Fields used in 2+ templates are "shared"
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

  const doGenerate = async (values: Record<string, string>) => {
    const api = getAPI();
    if (!api) return;
    setGenerating(true);
    try {
      const ids = Array.from(selectedIds);
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
      if (results.length === 1) toast.success('Report generated');
      else toast.success(`${results.length} reports generated`);
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

  // Deduplicate: fields that are shared only need to appear once (in the shared section)
  const sharedSet = new Set(sharedFields);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Reports for {fullName}</DialogTitle>
          <DialogDescription>Select one or more templates to generate.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input fields step — grouped by template */}
          {showInputs ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Fill in the custom fields. {sharedFields.length > 0 && 'Shared fields are filled once and used across all selected reports.'}
              </p>

              {/* Shared fields first */}
              {sharedFields.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shared across reports</p>
                    <Badge variant="secondary" className="text-[10px]">
                      Used in {inputGroups.filter(g => g.fields.some(f => sharedSet.has(f))).length} reports
                    </Badge>
                  </div>
                  <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                    {sharedFields.map((field) => {
                      const usedIn = inputGroups.filter(g => g.fields.includes(field)).map(g => g.templateName);
                      return (
                        <div key={field} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">{fieldToLabel(field)}</Label>
                            <span className="text-[10px] text-muted-foreground">
                              ({usedIn.join(', ')})
                            </span>
                          </div>
                          <Input
                            value={inputValues[field] || ''}
                            onChange={(e) => setInputValues(prev => ({ ...prev, [field]: e.target.value }))}
                            placeholder={`Enter ${fieldToLabel(field).toLowerCase()}`}
                            className="h-9"
                          />
                        </div>
                      );
                    })}
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
                <Button variant="outline" onClick={() => setShowInputs(false)}>Back</Button>
                <Button onClick={() => doGenerate(inputValues)} disabled={generating} className="flex-1">
                  {generating ? 'Generating...' : `Generate ${inputGroups.length > 1 ? inputGroups.length + ' Reports' : 'Report'}`}
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
