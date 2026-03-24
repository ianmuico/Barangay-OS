'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Copy, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/page-header';
import { getAPI, type ServerStatus } from '@/lib/ipc';
import { toast } from 'sonner';

export default function OnlineModePage() {
  const [status, setStatus] = useState<ServerStatus>({ running: false });
  const [port, setPort] = useState('3001');
  const [apiKey, setApiKey] = useState('');
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getServerStatus().then(setStatus);
    api.getSetting('api_port').then((v) => setPort(v || '3001'));
    api.getSetting('api_key').then((v) => setApiKey(v || ''));
  }, []);

  const toggleServer = async () => {
    const api = getAPI();
    if (!api) return;
    setToggling(true);
    try {
      if (status.running) {
        const result = await api.stopServer();
        if (result.success) { setStatus({ running: false }); toast.success('Server stopped'); }
      } else {
        if (!apiKey) {
          const newKey = crypto.randomUUID();
          await api.setSetting('api_key', newKey);
          setApiKey(newKey);
        }
        await api.setSetting('api_port', port);
        const result = await api.startServer(parseInt(port));
        if (result.success) {
          setStatus({ running: true, address: result.address, port: result.port, url: result.url });
          toast.success(`Server started at ${result.url}`);
        } else toast.error(result.error || 'Failed to start');
      }
    } finally { setToggling(false); }
  };

  const regenerateKey = async () => {
    const api = getAPI();
    if (!api) return;
    const newKey = crypto.randomUUID();
    await api.setSetting('api_key', newKey);
    setApiKey(newKey);
    toast.success('API key regenerated');
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  return (
    <div className="space-y-6">
      <PageHeader title="Online Mode" description="Enable API access so other apps can read resident data over the network." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {status.running ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4" />}
            Server Status
          </CardTitle>
          <CardDescription>Toggle the API server to make data accessible to other apps on the network.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{status.running ? 'Server Running' : 'Server Stopped'}</p>
              {status.running && <p className="text-sm text-muted-foreground">Accessible at {status.url}</p>}
            </div>
            <div className="flex items-center gap-3">
              {!status.running && (
                <div className="flex items-center gap-2">
                  <Label>Port:</Label>
                  <Input className="w-24" value={port} onChange={(e) => setPort(e.target.value)} />
                </div>
              )}
              <Switch checked={status.running} onCheckedChange={toggleServer} disabled={toggling} />
            </div>
          </div>

          {status.running && status.url && (
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Server URL</p><code className="text-sm">{status.url}</code></div>
                <Button variant="ghost" size="icon" onClick={() => copy(status.url!)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">API Key</p><code className="text-sm break-all">{apiKey || 'Not generated'}</code></div>
              <div className="flex gap-1">
                {apiKey && <Button variant="ghost" size="icon" onClick={() => copy(apiKey)}><Copy className="h-4 w-4" /></Button>}
                <Button variant="ghost" size="icon" onClick={regenerateKey}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Include this key in the X-API-Key header when making requests.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
