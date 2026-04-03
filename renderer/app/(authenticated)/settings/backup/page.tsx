'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Upload, Trash2, FlaskConical, ShieldAlert, Loader2, ChevronDown, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';
import { invalidateCache } from '@/lib/cache';

// ─── 6-Digit PIN Input ───────────────────────────────────────────────
function PinInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, ' ').split('').slice(0, 6).map(c => c === ' ' ? '' : c);

  // Auto-focus first box when mounted
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const focusInput = (idx: number) => {
    if (idx >= 0 && idx <= 5) {
      inputRefs.current[idx]?.focus();
      inputRefs.current[idx]?.select();
    }
  };

  const handleInput = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value;
    const digit = char.replace(/\D/g, '').slice(-1);
    if (!digit) return;

    const arr = [...digits];
    arr[index] = digit;
    onChange(arr.join(''));

    if (index < 5) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = [...digits];
      if (arr[index]) {
        arr[index] = '';
        onChange(arr.join(''));
      } else if (index > 0) {
        arr[index - 1] = '';
        onChange(arr.join(''));
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      focusInput(index - 1);
    } else if (e.key === 'ArrowRight') {
      focusInput(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    focusInput(Math.min(pasted.length, 5));
  };

  return (
    <div className="flex gap-2.5 justify-center">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          value={digits[i]}
          disabled={disabled}
          onChange={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="w-12 h-14 text-center text-2xl font-mono font-bold rounded-lg border-2 border-input bg-background text-foreground transition-all focus:border-destructive focus:ring-2 focus:ring-destructive/30 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="·"
        />
      ))}
    </div>
  );
}

// ─── Danger Zone action config ────────────────────────────────────────
type DangerAction = 'wipe' | 'fill' | 'reseed';

const ACTION_CONFIG = {
  wipe: {
    dialogTitle: 'Confirm Database Wipe',
    dialogDesc: 'This will permanently delete all residents, reports, templates, officials, and audit logs. User accounts will be preserved. This cannot be undone.',
    buttonLabel: 'Wipe All Data',
    successMsg: 'Database wiped successfully. Reloading...',
    icon: Trash2,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  fill: {
    dialogTitle: 'Confirm Test Data Generation',
    dialogDesc: 'This will generate ~800 test residents with Filipino names, family trees (grandparents, parents, children), partner links, varied demographics, and purok assignments.',
    buttonLabel: 'Generate Test Data',
    successMsg: 'Test data generated! Reloading...',
    icon: FlaskConical,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  reseed: {
    dialogTitle: 'Restore Default Templates',
    dialogDesc: 'This will re-insert all default report templates (Barangay Clearance, Certificate of Residency, Indigency, Business Clearance, etc.). Existing templates with the same name will not be duplicated.',
    buttonLabel: 'Restore Templates',
    successMsg: 'Default templates restored! Reloading...',
    icon: FileText,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
};

export default function BackupRestorePage() {
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [dialogAction, setDialogAction] = useState<DangerAction | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinError, setPinError] = useState(false);

  const handleBackup = async () => {
    const api = getAPI();
    if (!api) return;
    setBacking(true);
    try {
      const result = await api.backupDatabase();
      if (result.success) toast.success(`Database backed up to: ${result.path}`);
      else toast.error(result.error || 'Backup failed');
    } finally { setBacking(false); }
  };

  const handleRestore = async () => {
    const api = getAPI();
    if (!api) return;
    setRestoring(true);
    try {
      const result = await api.restoreDatabase();
      if (result.success) {
        toast.success('Database restored. App will reload.');
        setTimeout(() => window.location.reload(), 1500);
      } else toast.error(result.error || 'Restore failed');
    } finally { setRestoring(false); }
  };

  const openDangerDialog = (action: DangerAction) => {
    setPin('');
    setPinError(false);
    setDialogAction(action);
  };

  const closeDangerDialog = () => {
    if (loading) return;
    setDialogAction(null);
    setPin('');
    setPinError(false);
  };

  const handleDangerConfirm = async () => {
    if (pin.replace(/\s/g, '').length !== 6) return;
    const api = getAPI();
    if (!api || !dialogAction) return;

    setLoading(true);
    setPinError(false);

    try {
      const result = dialogAction === 'wipe'
        ? await api.wipeDatabase(pin)
        : dialogAction === 'reseed'
        ? await api.reseedTemplates(pin)
        : await api.fillTestData(pin);

      if (result.success) {
        toast.success(ACTION_CONFIG[dialogAction].successMsg);
        invalidateCache();
        closeDangerDialog();
        setTimeout(() => window.location.reload(), 1500);
      } else {
        if (result.error === 'Invalid PIN') {
          setPinError(true);
          setPin('');
        } else {
          toast.error(result.error || 'Operation failed');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const config = dialogAction ? ACTION_CONFIG[dialogAction] : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Backup & Restore" description="Save your data to a flash drive or restore from a backup." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Download className="h-4 w-4" />Backup Database</CardTitle>
          <CardDescription>Save a copy of your database to external storage like a USB flash drive.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackup} disabled={backing}>{backing ? 'Creating backup...' : 'Backup Now'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4" />Restore Database</CardTitle>
          <CardDescription>Restore from a previously backed up file. This will overwrite all current data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleRestore} disabled={restoring}>{restoring ? 'Restoring...' : 'Restore from Backup'}</Button>
        </CardContent>
      </Card>

      {/* ─── Danger Zone (collapsible, hidden by default) ──────────── */}
      <Separator />

      <div>
        <button
          onClick={() => setDangerExpanded(!dangerExpanded)}
          className="flex items-center gap-2 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
        >
          <ShieldAlert className="h-3 w-3" />
          <span className="font-medium uppercase tracking-widest">Danger Zone</span>
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${dangerExpanded ? 'rotate-180' : ''}`} />
        </button>

        {dangerExpanded && (
          <div className="mt-4 space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
            {/* Warning */}
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
              <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                These actions require a 6-digit authorization code and may permanently alter your data.
              </p>
            </div>

            {/* Wipe */}
            <div className="flex items-center justify-between rounded-md border border-destructive/20 px-4 py-3">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                  Wipe Database
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Delete all data except user accounts. Start fresh.
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => openDangerDialog('wipe')}>
                Wipe
              </Button>
            </div>

            {/* Restore Default Templates */}
            <div className="flex items-center justify-between rounded-md border border-blue-500/20 px-4 py-3">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Restore Default Templates
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Re-insert all built-in report templates (clearances, certifications, etc.).
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                onClick={() => openDangerDialog('reseed')}
              >
                Restore
              </Button>
            </div>

            {/* Fill Test Data */}
            <div className="flex items-center justify-between rounded-md border border-amber-500/20 px-4 py-3">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5" />
                  Fill Test Data
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Generate ~800 test residents with families and demographics.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500/30 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
                onClick={() => openDangerDialog('fill')}
              >
                Fill
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* PIN Verification Dialog */}
      <Dialog open={!!dialogAction} onOpenChange={closeDangerDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${config?.bgColor}`}>
                {config && <config.icon className={`h-6 w-6 ${config.color}`} />}
              </div>
            </div>
            <DialogTitle className="text-center">{config?.dialogTitle}</DialogTitle>
            <DialogDescription className="text-center text-xs leading-relaxed">
              {config?.dialogDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm font-medium text-center mb-4">Enter 6-digit authorization code</p>
            <PinInput value={pin} onChange={setPin} disabled={loading} />
            {pinError && (
              <p className="text-xs text-destructive text-center mt-3 animate-in fade-in">
                Invalid code. Please try again.
              </p>
            )}
          </div>

          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="outline" onClick={closeDangerDialog} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDangerConfirm}
              disabled={pin.replace(/\s/g, '').length !== 6 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                config?.buttonLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
