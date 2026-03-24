'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileSpreadsheet, ArrowRight, Check, AlertTriangle, Loader2, X, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────

interface SystemField {
  key: string;
  label: string;
  required: boolean;
}

interface ImportErrorRow {
  row: number;
  field: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  batchId?: number;
  imported: number;
  skipped: number;
  duplicates: { exact: number; fuzzy: number };
  errors: ImportErrorRow[];
}

interface CSVImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type Step = 'file' | 'mapping' | 'importing' | 'results';

// ─── Fuzzy matching helpers ────────────────────────────────────────

const ALIAS_MAP: Record<string, string[]> = {
  first_name: ['first name', 'firstname', 'fname', 'pangalan', 'unang pangalan', 'given name'],
  last_name: ['last name', 'lastname', 'lname', 'apelyido', 'surname', 'family name'],
  middle_name: ['middle name', 'middlename', 'mname', 'gitnang pangalan'],
  suffix: ['suffix', 'sfx', 'ext', 'name suffix', 'jr sr'],
  birth_date: ['birth date', 'birthdate', 'birthday', 'bday', 'date of birth', 'dob', 'kapanganakan', 'kaarawan'],
  gender: ['gender', 'sex', 'kasarian'],
  civil_status: ['civil status', 'civilstatus', 'marital status', 'marital', 'katayuang sibil'],
  address: ['address', 'addr', 'tirahan', 'full address', 'home address'],
  purok: ['purok', 'zone', 'sitio', 'area'],
  contact_number: ['contact number', 'contactnumber', 'phone', 'mobile', 'cellphone', 'telepono', 'contact no', 'phone number', 'cell'],
  email: ['email', 'email address', 'e-mail'],
  occupation: ['occupation', 'job', 'work', 'hanapbuhay', 'trabaho', 'profession'],
  voter_status: ['voter status', 'voterstatus', 'voter', 'registered voter'],
  blood_type: ['blood type', 'bloodtype', 'blood'],
  religion: ['religion', 'relihiyon', 'faith'],
  citizenship: ['citizenship', 'nationality', 'pagkamamamayan'],
  philsys_card_no: ['philsys', 'philsys card', 'philsys card no', 'national id', 'phil id', 'philid'],
  educational_attainment: ['educational attainment', 'education', 'educ', 'educ attainment', 'pinag-aralan'],
  notes: ['notes', 'remarks', 'tala'],
};

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fuzzyMatchField(csvHeader: string, systemFields: SystemField[]): string | null {
  const norm = normalize(csvHeader);

  for (const field of systemFields) {
    // Exact key match
    if (norm === field.key.replace(/_/g, ' ')) return field.key;
    // Exact label match
    if (norm === normalize(field.label)) return field.key;
  }

  // Alias matching
  for (const [key, aliases] of Object.entries(ALIAS_MAP)) {
    if (systemFields.some(f => f.key === key)) {
      for (const alias of aliases) {
        if (norm === alias || norm.includes(alias) || alias.includes(norm)) {
          return key;
        }
      }
    }
  }

  return null;
}

// ─── Component ─────────────────────────────────────────────────────

export function CSVImportDialog({ open, onClose, onImportComplete }: CSVImportDialogProps) {
  const { t } = useTranslation();

  // State
  const [step, setStep] = useState<Step>('file');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [dateFormat, setDateFormat] = useState<string>('MM/DD/YYYY');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [systemFields, setSystemFields] = useState<SystemField[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loadingHeaders, setLoadingHeaders] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('file');
      setFilePath(null);
      setFileName('');
      setDateFormat('MM/DD/YYYY');
      setCsvHeaders([]);
      setSystemFields([]);
      setMapping({});
      setSkipDuplicates(true);
      setImporting(false);
      setImportResult(null);
      setLoadingHeaders(false);
    }
  }, [open]);

  // Mapped system field keys (to prevent duplicate assignment)
  const usedFieldKeys = useMemo(() => {
    return new Set(Object.values(mapping).filter(Boolean));
  }, [mapping]);

  // Check if all required fields are mapped
  const requiredFieldsMapped = useMemo(() => {
    const requiredKeys = systemFields.filter(f => f.required).map(f => f.key);
    return requiredKeys.every(key => usedFieldKeys.has(key));
  }, [systemFields, usedFieldKeys]);

  // ─── Handlers ──────────────────────────────────────────────────

  const handleSelectFile = useCallback(async () => {
    const api = getAPI();
    if (!api) return;

    const result = await api.selectFile({
      title: t('import.selectFile', 'Select CSV File'),
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const path = result.filePaths[0];
      setFilePath(path);
      setFileName(path.split(/[/\\]/).pop() || path);
    }
  }, [t]);

  const handleDownloadTemplate = useCallback(async () => {
    const api = getAPI();
    if (!api) return;

    try {
      const result = await (api as any).downloadCSVTemplate();
      if (result.success) {
        toast.success(t('import.templateDownloaded', 'CSV template downloaded'));
      }
    } catch {
      toast.error(t('import.templateError', 'Failed to download template'));
    }
  }, [t]);

  const handleProceedToMapping = useCallback(async () => {
    if (!filePath) return;
    const api = getAPI();
    if (!api) return;

    setLoadingHeaders(true);
    try {
      const [headers, fields] = await Promise.all([
        (api as any).getCSVHeaders(filePath) as Promise<string[]>,
        (api as any).getSystemFields() as Promise<SystemField[]>,
      ]);

      setCsvHeaders(headers);
      setSystemFields(fields);

      // Auto-match columns
      const autoMapping: Record<string, string> = {};
      const assignedKeys = new Set<string>();

      for (const header of headers) {
        const matched = fuzzyMatchField(header, fields);
        if (matched && !assignedKeys.has(matched)) {
          autoMapping[header] = matched;
          assignedKeys.add(matched);
        }
      }

      setMapping(autoMapping);
      setStep('mapping');
    } catch {
      toast.error(t('import.headersError', 'Failed to read CSV headers'));
    } finally {
      setLoadingHeaders(false);
    }
  }, [filePath, t]);

  const handleMappingChange = useCallback((csvHeader: string, fieldKey: string) => {
    setMapping(prev => {
      const next = { ...prev };
      if (fieldKey === '__none__') {
        delete next[csvHeader];
      } else {
        // Remove this fieldKey from any other mapping
        for (const key of Object.keys(next)) {
          if (next[key] === fieldKey && key !== csvHeader) {
            delete next[key];
          }
        }
        next[csvHeader] = fieldKey;
      }
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (!filePath) return;
    const api = getAPI();
    if (!api) return;

    setStep('importing');
    setImporting(true);

    try {
      const result = await (api as any).importCSV({
        filePath,
        mapping,
        dateFormat,
        skipDuplicates,
      }) as ImportResult;

      setImportResult(result);
      setStep('results');

      if (result.success && result.imported > 0) {
        onImportComplete?.();
      }
    } catch {
      toast.error(t('import.importFailed', 'Import failed'));
      setStep('mapping');
    } finally {
      setImporting(false);
    }
  }, [filePath, mapping, dateFormat, skipDuplicates, t, onImportComplete]);

  const handleRollback = useCallback(async () => {
    if (!importResult?.batchId) return;
    const api = getAPI();
    if (!api) return;

    try {
      const result = await (api as any).rollbackImport(importResult.batchId) as { success: boolean; deletedCount?: number };
      if (result.success) {
        toast.success(t('import.rollbackSuccess', 'Import rolled back. {{count}} records removed.').replace('{{count}}', String(result.deletedCount ?? 0)));
        onImportComplete?.();
        onClose();
      }
    } catch {
      toast.error(t('import.rollbackFailed', 'Rollback failed'));
    }
  }, [importResult, t, onImportComplete, onClose]);

  // ─── Render helpers ────────────────────────────────────────────

  const renderFileStep = () => (
    <div className="space-y-4">
      {/* File selection */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">{t('import.csvFile', 'CSV File')}</Label>
        <div
          onClick={handleSelectFile}
          className="flex items-center gap-3 rounded-lg border-2 border-dashed p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
        >
          {filePath ? (
            <>
              <FileSpreadsheet className="h-8 w-8 text-emerald-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground truncate">{filePath}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setFilePath(null);
                  setFileName('');
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground/50 shrink-0" />
              <div>
                <p className="text-sm font-medium">{t('import.clickToSelect', 'Click to select a CSV file')}</p>
                <p className="text-xs text-muted-foreground">{t('import.supportedFormat', 'Supported format: .csv')}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Date format */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">{t('import.dateFormat', 'Date Format in CSV')}</Label>
        <Select value={dateFormat} onValueChange={setDateFormat}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (01/31/2000)</SelectItem>
            <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (31/01/2000)</SelectItem>
            <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2000-01-31)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Download template link */}
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handleDownloadTemplate}>
        <Download className="mr-1.5 h-3 w-3" />
        {t('import.downloadTemplate', 'Download CSV template')}
      </Button>
    </div>
  );

  const renderMappingStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t('import.mappingInstructions', 'Map each CSV column to a system field. Required fields are marked with')} <span className="text-red-500">*</span>
        </p>
      </div>

      <ScrollArea className="h-[320px] rounded-md border">
        <div className="p-3 space-y-2">
          {csvHeaders.map((header) => {
            const mappedField = mapping[header];
            const fieldInfo = mappedField ? systemFields.find(f => f.key === mappedField) : null;

            return (
              <div key={header} className="flex items-center gap-2">
                {/* CSV header */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 h-9 rounded-md border bg-muted/50 px-3">
                    <FileSpreadsheet className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{header}</span>
                  </div>
                </div>

                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

                {/* System field dropdown */}
                <div className="flex-1 min-w-0">
                  <Select
                    value={mappedField || '__none__'}
                    onValueChange={(value) => handleMappingChange(header, value)}
                  >
                    <SelectTrigger className={`h-9 ${mappedField ? '' : 'text-muted-foreground'}`}>
                      <SelectValue placeholder={t('import.skipColumn', 'Skip this column')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">{t('import.skipColumn', 'Skip this column')}</span>
                      </SelectItem>
                      {systemFields.map((field) => {
                        const isUsed = usedFieldKeys.has(field.key) && mapping[header] !== field.key;
                        return (
                          <SelectItem key={field.key} value={field.key} disabled={isUsed}>
                            {field.label}
                            {field.required ? ' *' : ''}
                            {isUsed ? ` (${t('import.alreadyMapped', 'mapped')})` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status indicator */}
                <div className="w-5 shrink-0 flex justify-center">
                  {mappedField && (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Unmapped required fields warning */}
      {!requiredFieldsMapped && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t('import.requiredFieldsWarning', 'Some required fields are not mapped. Please map all required fields before importing.')}
          </p>
        </div>
      )}

      {/* Skip duplicates checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox checked={skipDuplicates} onCheckedChange={(checked) => setSkipDuplicates(checked === true)} />
        <span className="text-sm">{t('import.skipDuplicates', 'Skip duplicate records')}</span>
      </label>

      {/* Mapping summary */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {Object.keys(mapping).length}/{csvHeaders.length}
        </Badge>
        {t('import.columnsMapped', 'columns mapped')}
      </div>
    </div>
  );

  const renderImportingStep = () => (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <Loader2 className="h-10 w-10 text-primary animate-spin" />
      <div className="text-center">
        <p className="text-sm font-medium">{t('import.importing', 'Importing records...')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('import.pleaseWait', 'Please wait, this may take a moment.')}</p>
      </div>
    </div>
  );

  const renderResultsStep = () => {
    if (!importResult) return null;

    const hasErrors = importResult.errors.length > 0;
    const hasDuplicates = importResult.duplicates.exact > 0 || importResult.duplicates.fuzzy > 0;

    return (
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-emerald-500/5 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importResult.imported}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t('import.imported', 'Imported')}</p>
          </div>
          <div className="rounded-lg border bg-amber-500/5 p-3 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{importResult.skipped}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t('import.skipped', 'Skipped')}</p>
          </div>
          <div className="rounded-lg border bg-red-500/5 p-3 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.errors.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t('import.errors', 'Errors')}</p>
          </div>
        </div>

        {/* Duplicates info */}
        {hasDuplicates && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
              {importResult.duplicates.exact > 0 && (
                <p>{t('import.exactDuplicates', '{{count}} exact duplicates found').replace('{{count}}', String(importResult.duplicates.exact))}</p>
              )}
              {importResult.duplicates.fuzzy > 0 && (
                <p>{t('import.fuzzyDuplicates', '{{count}} possible duplicates (fuzzy match)').replace('{{count}}', String(importResult.duplicates.fuzzy))}</p>
              )}
            </div>
          </div>
        )}

        {/* Error rows */}
        {hasErrors && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              {t('import.errorDetails', 'Error Details')}
            </p>
            <ScrollArea className="h-[160px] rounded-md border">
              <div className="p-2 space-y-1">
                {importResult.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md bg-red-500/5 px-2.5 py-1.5 text-xs">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 font-mono">
                      {t('import.row', 'Row')} {err.row}
                    </Badge>
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">{err.field}</span>: {err.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Rollback button */}
        {importResult.batchId && importResult.imported > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10 border-red-200 dark:border-red-500/20"
            onClick={handleRollback}
          >
            <RotateCcw className="mr-1.5 h-3 w-3" />
            {t('import.rollback', 'Undo Import')}
          </Button>
        )}
      </div>
    );
  };

  // ─── Step title & description ──────────────────────────────────

  const stepConfig = {
    file: {
      title: t('import.title', 'Import Residents from CSV'),
      description: t('import.fileDescription', 'Select a CSV file and configure the date format.'),
    },
    mapping: {
      title: t('import.mappingTitle', 'Map CSV Columns'),
      description: t('import.mappingDescription', 'Match each CSV column to the corresponding system field.'),
    },
    importing: {
      title: t('import.importingTitle', 'Importing...'),
      description: t('import.importingDescription', 'Your records are being imported.'),
    },
    results: {
      title: t('import.resultsTitle', 'Import Complete'),
      description: t('import.resultsDescription', 'Review the import results below.'),
    },
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {stepConfig[step].title}
          </DialogTitle>
          <DialogDescription>{stepConfig[step].description}</DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        {step !== 'importing' && (
          <div className="flex items-center gap-1.5 px-1">
            {(['file', 'mapping', 'results'] as const).map((s, i) => {
              const stepIndex = ['file', 'mapping', 'results'].indexOf(step);
              const thisIndex = i;
              const isActive = thisIndex === stepIndex;
              const isComplete = thisIndex < stepIndex;

              return (
                <div key={s} className="flex items-center gap-1.5 flex-1">
                  <div className={`
                    flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium shrink-0 transition-colors
                    ${isActive ? 'bg-primary text-primary-foreground' : ''}
                    ${isComplete ? 'bg-emerald-500 text-white' : ''}
                    ${!isActive && !isComplete ? 'bg-muted text-muted-foreground' : ''}
                  `}>
                    {isComplete ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  {i < 2 && (
                    <div className={`flex-1 h-px ${isComplete ? 'bg-emerald-500' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Step content */}
        {step === 'file' && renderFileStep()}
        {step === 'mapping' && renderMappingStep()}
        {step === 'importing' && renderImportingStep()}
        {step === 'results' && renderResultsStep()}

        {/* Footer */}
        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'file' && (
            <>
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={handleProceedToMapping} disabled={!filePath || loadingHeaders}>
                {loadingHeaders && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('import.next', 'Next')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('file')}>
                {t('import.back', 'Back')}
              </Button>
              <Button onClick={handleImport} disabled={!requiredFieldsMapped}>
                <Upload className="mr-2 h-4 w-4" />
                {t('import.startImport', 'Import')}
              </Button>
            </>
          )}
          {step === 'results' && (
            <Button onClick={onClose}>
              {t('common.close', 'Close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
