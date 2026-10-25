'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAPI, type UpdateCheckResult } from '@/lib/ipc';

// Settings card: current version + a manual "Check for updates" button.
// Updates also check by themselves every 30 minutes and on reconnect.
export function SoftwareUpdateCard() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    return api.onUpdateProgress((p) => setProgress(p));
  }, []);

  const handleCheck = async () => {
    const api = getAPI();
    if (!api) return;
    setChecking(true);
    try {
      setResult(await api.checkForUpdates());
    } catch (e: any) {
      setResult({ success: false, current: '', error: e?.message || 'Update check failed' });
    } finally {
      setChecking(false);
    }
  };

  const status = (() => {
    if (!result) return null;
    if (!result.success) return result.error;
    switch (result.status) {
      case 'up-to-date':
        return `You're on the latest version (${result.current}).`;
      case 'downloading':
        return progress !== null && progress < 100
          ? `Downloading version ${result.latest ?? ''}… ${progress}%`
          : `Version ${result.latest ?? ''} is downloading in the background. You'll be asked to restart when it's ready.`;
      case 'ready':
        return `Version ${result.latest} is ready. Restart the app to apply it.`;
      default:
        return null;
    }
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><RefreshCw className="h-4 w-4" />Software Updates</CardTitle>
        <CardDescription>
          The app updates itself whenever this computer is online. Your data is never touched by an update.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={handleCheck} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}
