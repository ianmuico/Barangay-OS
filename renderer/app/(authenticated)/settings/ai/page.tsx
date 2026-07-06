'use client';

import { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, XCircle, ShieldCheck, Cpu } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

// OpenAI-compatible providers. The app only ever sends placeholder tokens +
// your instruction — never resident data — so a hosted free tier is safe here.
const PRESETS: Record<string, { label: string; baseUrl: string; model: string; note: string }> = {
  gemini: {
    label: 'Google Gemini (free tier — recommended)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    note: 'Generous free quota and good quality. Get a free key at aistudio.google.com/apikey.',
  },
  groq: {
    label: 'Groq (free — very fast)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    note: 'Free and extremely fast. Get a key at console.groq.com/keys.',
  },
  openrouter: {
    label: 'OpenRouter (has free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    note: 'Aggregates many providers, including some free models. Key at openrouter.ai/keys.',
  },
  ollama: {
    label: 'Ollama (fully offline — needs a capable PC)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    note: 'Runs on this computer with no internet. Needs ~8GB RAM; not for low-spec laptops. Leave the key blank.',
  },
  custom: {
    label: 'Custom (any OpenAI-compatible server)',
    baseUrl: '',
    model: '',
    note: 'Enter the base URL and model name of any OpenAI-compatible chat endpoint.',
  },
};

export default function AISettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [preset, setPreset] = useState<string>('gemini');
  const [baseUrl, setBaseUrl] = useState(PRESETS.gemini.baseUrl);
  const [model, setModel] = useState(PRESETS.gemini.model);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getSetting('ai_enabled').then((v) => setEnabled(v === '1'));
    api.getSetting('ai_base_url').then((v) => { if (v) setBaseUrl(v); });
    api.getSetting('ai_model').then((v) => { if (v) setModel(v); });
    api.getSetting('ai_api_key').then((v) => setApiKey(v || ''));
  }, []);

  const applyPreset = (key: string) => {
    setPreset(key);
    setTestResult(null);
    const p = PRESETS[key];
    if (key !== 'custom') {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
  };

  const save = async () => {
    const api = getAPI();
    if (!api) return;
    setSaving(true);
    try {
      await api.setSetting('ai_enabled', enabled ? '1' : '0');
      await api.setSetting('ai_base_url', baseUrl.trim());
      await api.setSetting('ai_model', model.trim());
      await api.setSetting('ai_api_key', apiKey.trim());
      toast.success('AI settings saved');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const api = getAPI();
    if (!api) return;
    // Persist first so the backend tests what's on screen.
    await api.setSetting('ai_base_url', baseUrl.trim());
    await api.setSetting('ai_model', model.trim());
    await api.setSetting('ai_api_key', apiKey.trim());
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.aiTest();
      if (r.success) {
        setTestResult({ success: true, message: `Connected — model "${r.model}" responded.` });
      } else {
        setTestResult({ success: false, message: r.error || 'Connection failed.' });
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Assistant"
        description="Optional helper that drafts certificate templates from a plain-language description."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Enable AI template drafting
          </CardTitle>
          <CardDescription>
            When on, an &quot;AI Draft&quot; button appears in the template editor. The app works fully without this —
            it&apos;s purely a convenience.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{enabled ? 'AI Assistant is on' : 'AI Assistant is off'}</p>
              <p className="text-sm text-muted-foreground">Toggle the feature for this computer.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={preset} onValueChange={applyPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRESETS).map(([key, p]) => (
                  <SelectItem key={key} value={key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{PRESETS[preset].note}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Server URL</Label>
              <Input value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setPreset('custom'); }} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input value={model} onChange={(e) => { setModel(e.target.value); }} placeholder="e.g. gemini-2.0-flash" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>API key</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your free API key (leave blank for local Ollama)" />
            <p className="text-xs text-muted-foreground">Stored only on this computer, in the local database.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            <Button variant="outline" onClick={test} disabled={testing}>{testing ? 'Testing...' : 'Test connection'}</Button>
            {testResult && (
              <div className={`flex items-center gap-1.5 text-sm ${testResult.success ? 'text-green-600' : 'text-destructive'}`}>
                {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.message}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Privacy &amp; what gets sent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>The AI only ever receives your <strong className="text-foreground">description</strong> and the list of
              placeholder tokens (like <code className="text-xs">{'{{fullName}}'}</code>). It writes the template; the app
              fills in real data later, offline.</li>
            <li><strong className="text-foreground">No resident data is ever sent</strong> to the AI provider.</li>
            <li>Using a hosted provider requires internet only while drafting. Generating finished certificates and every
              other feature stays fully offline.</li>
            <li>For a fully offline setup, choose <strong className="text-foreground">Ollama</strong> — but it needs a
              capable PC (see the note above).</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            Runs on low-spec laptops
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          With a hosted provider (Gemini, Groq, OpenRouter), this computer only sends a small request and waits for the
          reply — there is no heavy local computation, so it works on older, low-memory laptops. Full setup steps are in
          <code className="text-xs"> AI-SETUP.md</code> in the project folder.
        </CardContent>
      </Card>
    </div>
  );
}
