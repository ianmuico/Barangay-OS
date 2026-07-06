'use client';

import { useState } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

interface ExcelImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = 'file' | 'confirm' | 'importing' | 'results';

export function ExcelImportDialog({ open, onClose, onImportComplete }: ExcelImportDialogProps) {
  const [step, setStep] = useState<Step>('file');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ totalImported: number; totalSkipped: number; errors: { row: number; field: string; message: string }[] } | null>(null);

  const reset = () => {
    setStep('file'); setFilePath(''); setFileName(''); setRows([]); setResult(null); setBusy(false);
  };

  const close = () => { reset(); onClose(); };

  const pickFile = async () => {
    const api = getAPI();
    if (!api) return;
    const res = await api.selectFile({
      properties: ['openFile'],
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });
    if (res.canceled || !res.filePaths?.length) return;
    const path = res.filePaths[0];
    setBusy(true);
    try {
      const read = await api.readExcelFile(path);
      if (!read.success) { toast.error(read.error || 'Could not read file'); return; }
      if (!read.rows || read.rows.length === 0) { toast.error('No filled-in rows found in the Residents sheet.'); return; }
      setFilePath(path);
      setFileName(path.split(/[\\/]/).pop() || path);
      setRows(read.rows);
      setStep('confirm');
    } finally { setBusy(false); }
  };

  const runImport = async () => {
    const api = getAPI();
    if (!api) return;
    setStep('importing');
    setBusy(true);
    try {
      const res = await api.importExcel(rows, skipDuplicates);
      if (!res.success) { toast.error(res.error || 'Import failed'); setStep('confirm'); return; }
      setResult({
        totalImported: res.totalImported || 0,
        totalSkipped: res.totalSkipped || 0,
        errors: res.errors || [],
      });
      setStep('results');
      onImportComplete();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) close(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Import from Excel Template
          </DialogTitle>
          <DialogDescription>
            Import a filled-in barangay Excel template (the one purok leaders fill in). Family links set via Ref Codes or Resident IDs are applied automatically.
          </DialogDescription>
        </DialogHeader>

        {step === 'file' && (
          <div className="space-y-4 py-2">
            <button
              onClick={pickFile}
              disabled={busy}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed py-10 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
              <span>{busy ? 'Reading file...' : 'Choose a filled-in .xlsx template'}</span>
            </button>
            <p className="text-xs text-muted-foreground">
              Don&apos;t have the template yet? Close this and use the <strong>Excel Template</strong> button to download one,
              or use <strong>Import CSV</strong> for non-template files.
            </p>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <p><span className="text-muted-foreground">File:</span> <span className="font-medium">{fileName}</span></p>
              <p className="mt-1"><span className="text-muted-foreground">Rows with data:</span> <span className="font-medium">{rows.length}</span></p>
            </div>
            <ToggleChip checked={skipDuplicates} onCheckedChange={setSkipDuplicates}>
              Skip duplicates (same name + birth date already in the system)
            </ToggleChip>
            <p className="text-xs text-muted-foreground">
              Relationships are linked after everyone is created. Any that can&apos;t be matched are reported but never block the import.
            </p>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Importing {rows.length} residents and linking families...</p>
          </div>
        )}

        {step === 'results' && result && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-900 dark:bg-green-950/30">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span><strong>{result.totalImported}</strong> imported{result.totalSkipped > 0 && `, ${result.totalSkipped} skipped`}.</span>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />{result.errors.length} note{result.errors.length === 1 ? '' : 's'} (rows skipped or relationships left unlinked)
                </p>
                <div className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <p key={i}>Row {e.row}: {e.message}</p>
                  ))}
                  {result.errors.length > 50 && <p>...and {result.errors.length - 50} more</p>}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('file')} disabled={busy}>Back</Button>
              <Button onClick={runImport} disabled={busy}>Import {rows.length} Residents</Button>
            </>
          )}
          {step === 'results' && <Button onClick={close}>Done</Button>}
          {(step === 'file') && <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
