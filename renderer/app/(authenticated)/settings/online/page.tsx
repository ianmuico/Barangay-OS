'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Copy, RefreshCw, CheckCircle2, XCircle, BookOpen, ServerCog, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { getAPI, type ServerStatus } from '@/lib/ipc';
import { toast } from 'sonner';

const ENDPOINTS = [
  { method: 'GET', path: '/api/health', auth: false, desc: 'Server status and barangay name. No key required — use it to check the connection.' },
  { method: 'GET', path: '/api/stats', auth: true, desc: 'Demographic summary: resident counts (total, seniors, youth, indigents, 4Ps, by gender), households, and case counts.' },
  { method: 'GET', path: '/api/residents', auth: true, desc: 'Paginated resident list. Query params: search, page, limit (max 200), sortBy, sortOrder, is_senior=true, is_indigent=true.' },
  { method: 'GET', path: '/api/residents/:id', auth: true, desc: 'Single resident by ID with all fields.' },
  { method: 'GET', path: '/api/residents/by-uid/:uid', auth: true, desc: 'Look up a resident by their permanent QR/UID (used by the mobile app after scanning).' },
  { method: 'POST', path: '/api/residents', auth: true, desc: 'Create a resident. Required: first_name, last_name, birth_date, gender, civil_status. Returns the created record.' },
  { method: 'PUT', path: '/api/residents/:id', auth: true, desc: 'Update a resident. Send only the fields to change. Deleting is not available over the API.' },
  { method: 'GET', path: '/api/households', auth: true, desc: 'All households with their numbers and addresses.' },
  { method: 'GET', path: '/api/officials', auth: true, desc: 'Barangay officials with name and position. Add ?active=true for current officials only.' },
];

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => { navigator.clipboard.writeText(code); toast.success('Copied'); }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function OnlineModePage() {
  const [status, setStatus] = useState<ServerStatus>({ running: false });
  const [port, setPort] = useState('3001');
  const [apiKey, setApiKey] = useState('');
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

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
    setTestResult(null);
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
    toast.success('API key regenerated — apps using the old key will stop working');
  };

  const runTest = async () => {
    const api = getAPI();
    if (!api) return;
    setTesting(true);
    try {
      const result = await api.testServer();
      if (result.success) {
        setTestResult({ success: true, message: 'Health check and authenticated request both succeeded. The API is working.' });
      } else {
        setTestResult({ success: false, message: result.error || 'Test failed' });
      }
    } finally { setTesting(false); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  const baseUrl = status.url || `http://<this-computer-ip>:${port}`;

  const curlExample = `# Check the server is reachable (no key needed)
curl ${baseUrl}/api/health

# Fetch residents (key required)
curl -H "X-API-Key: ${apiKey || 'YOUR_API_KEY'}" \\
  "${baseUrl}/api/residents?limit=10&is_senior=true"`;

  const jsExample = `const BASE_URL = '${baseUrl}';
const API_KEY = '${apiKey || 'YOUR_API_KEY'}';

async function getStats() {
  const res = await fetch(\`\${BASE_URL}/api/stats\`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!res.ok) throw new Error(\`API error: \${res.status}\`);
  return res.json();
}

getStats().then((stats) => {
  console.log(\`\${stats.barangay}: \${stats.residents.total} residents\`);
});`;

  const pythonExample = `import requests

BASE_URL = "${baseUrl}"
HEADERS = {"X-API-Key": "${apiKey || 'YOUR_API_KEY'}"}

# Search residents by name
res = requests.get(
    f"{BASE_URL}/api/residents",
    params={"search": "dela cruz", "limit": 20},
    headers=HEADERS,
)
for r in res.json()["data"]:
    print(r["first_name"], r["last_name"])`;

  return (
    <div className="space-y-6">
      <PageHeader title="Online Mode" description="Share read-only barangay data with other apps on your local network." />

      <Tabs defaultValue="server" className="space-y-4">
        <TabsList>
          <TabsTrigger value="server"><ServerCog className="mr-2 h-4 w-4" />Server</TabsTrigger>
          <TabsTrigger value="guide"><BookOpen className="mr-2 h-4 w-4" />API Guide</TabsTrigger>
        </TabsList>

        {/* ═══ Server Tab ═══ */}
        <TabsContent value="server" className="space-y-4">
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
                    <Button variant="ghost" size="icon" onClick={regenerateKey} title="Regenerate key"><RefreshCw className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Include this key in the X-API-Key header when making requests.</p>
              </div>

              {status.running && (
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={runTest} disabled={testing}>
                    {testing ? 'Testing...' : 'Test Connection'}
                  </Button>
                  {testResult && (
                    <div className={`flex items-center gap-1.5 text-sm ${testResult.success ? 'text-green-600' : 'text-destructive'}`}>
                      {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {testResult.message}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4" />
                Security Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                <li>The API is <strong className="text-foreground">read-only</strong> — external apps can view data but never change it.</li>
                <li>It only works on your <strong className="text-foreground">local network</strong> (same Wi-Fi/LAN). It is not exposed to the internet unless you deliberately configure your router to do so — don&apos;t.</li>
                <li>Anyone with the API key can read resident data. Treat the key like a password and regenerate it if it leaks or when staff with access leave.</li>
                <li>Requests are rate-limited to 100 per minute per device.</li>
                <li>Turn the server off when it&apos;s not needed.</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ API Guide Tab ═══ */}
        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How It Works</CardTitle>
              <CardDescription>
                Online Mode runs a small web server inside this app. Any program on the same network — a website, spreadsheet
                script, mobile app, or another computer — can request barangay data from it and build on top of it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Turn on the server in the <strong>Server</strong> tab. Note the <strong>Server URL</strong> (e.g. <code className="text-xs">{baseUrl}</code>) and copy the <strong>API Key</strong>.</li>
                <li>From your app, make HTTP GET requests to the URL, sending the key in the <code className="text-xs">X-API-Key</code> header.</li>
                <li>All responses are JSON. Start with <code className="text-xs">/api/health</code> (no key needed) to confirm the connection, then use the data endpoints below.</li>
              </ol>
              <p className="text-muted-foreground">
                The other device must be on the same network, and this computer must stay on with the server running.
                If requests fail, check the firewall allows the port, and use the Test Connection button on the Server tab.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Endpoints</CardTitle>
              <CardDescription>All endpoints are GET requests returning JSON. &quot;Key&quot; marks endpoints requiring the X-API-Key header.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ENDPOINTS.map((e) => (
                  <div key={e.path} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-[10px]">{e.method}</Badge>
                      <code className="text-sm font-medium">{e.path}</code>
                      {e.auth && <Badge variant="outline" className="text-[10px]">Key</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{e.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Examples</CardTitle>
              <CardDescription>Working examples using your current server URL and API key — copy and run them as-is.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Command line (curl)</p>
                <CodeBlock code={curlExample} />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">JavaScript (website, Node.js, or mobile app)</p>
                <CodeBlock code={jsExample} />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Python</p>
                <CodeBlock code={pythonExample} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Building Your Own App</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                A typical setup: a kiosk or information display in the barangay hall, a Google Sheets report that refreshes
                itself, or a simple web dashboard for officials. Your app polls the endpoints it needs and renders the data —
                for example, fetch <code className="text-xs">/api/stats</code> every few minutes for a live population board,
                or <code className="text-xs">/api/officials?active=true</code> to always show the current officials.
              </p>
              <p>
                Because the API is read-only, your app can never corrupt barangay records — the worst a bug can do is show
                stale data. If you need data updated, it has to be encoded in this system first; the API will reflect it
                immediately.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
