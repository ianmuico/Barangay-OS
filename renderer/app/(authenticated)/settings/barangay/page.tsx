'use client';

import { useEffect, useState } from 'react';
import { Upload, X, ImageIcon, FileText, Droplets } from 'lucide-react';
import { TemplateEditor } from '@/components/template-editor';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

export default function BarangaySettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getAllSettings().then(setSettings);
    api.getLogoBase64().then(setLogoPreview);
  }, []);

  const handleSave = async () => {
    const api = getAPI();
    if (!api) return;
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        await api.setSetting(key, value);
      }
      toast.success('Settings saved');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleUploadLogo = async () => {
    const api = getAPI();
    if (!api) return;
    setLogoLoading(true);
    try {
      const result = await api.selectFile({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (result.canceled || !result.filePaths?.length) return;
      await api.saveLogo(result.filePaths[0]);
      const base64 = await api.getLogoBase64();
      setLogoPreview(base64);
      toast.success('Logo uploaded');
    } finally {
      setLogoLoading(false);
    }
  };

  const handleRemoveLogo = async () => {
    const api = getAPI();
    if (!api) return;
    await api.removeLogo();
    setLogoPreview(null);
    toast.success('Logo removed');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Barangay Information" description="Configure your barangay details used in reports and documents." />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Logo Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Barangay Logo</CardTitle>
            <CardDescription>Used as watermark in generated reports. PNG recommended with transparent background.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="w-40 h-40 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden">
              {logoPreview ? (
                <img src={logoPreview} alt="Barangay Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-10 w-10" />
                  <span className="text-xs">No logo set</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleUploadLogo} disabled={logoLoading}>
                <Upload className="mr-2 h-3.5 w-3.5" />
                {logoPreview ? 'Change' : 'Upload'}
              </Button>
              {logoPreview && (
                <Button variant="outline" size="sm" onClick={handleRemoveLogo}>
                  <X className="mr-2 h-3.5 w-3.5" />
                  Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* General Info Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">General Information</CardTitle>
            <CardDescription>These details appear in generated reports and certificates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Barangay Name</Label>
                <Input value={settings.barangay_name || ''} onChange={(e) => update('barangay_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Number of Puroks</Label>
                <Input type="number" value={settings.number_of_puroks || '7'} onChange={(e) => update('number_of_puroks', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Barangay Address</Label>
                <Input value={settings.barangay_address || ''} onChange={(e) => update('barangay_address', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Municipality / City</Label>
                <Input value={settings.municipality || ''} onChange={(e) => update('municipality', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Province</Label>
                <Input value={settings.province || ''} onChange={(e) => update('province', e.target.value)} />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardContent>
        </Card>
      </div>
      {/* Watermark */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Droplets className="h-4 w-4" />
            Report Watermark
          </CardTitle>
          <CardDescription>
            Your barangay logo appears faintly in the center of every generated certificate, report and printed list.
            Adjust how big and how visible it is — or turn it off entirely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const wmEnabled = settings.watermark_enabled !== '0';
            const wmSize = Math.min(800, Math.max(100, parseInt(settings.watermark_size || '420', 10) || 420));
            const wmOpacity = Math.min(0.5, Math.max(0.01, parseFloat(settings.watermark_opacity || '0.06') || 0.06));
            // Preview sheet is 280px wide vs a real 794px A4 page
            const previewScale = 280 / 794;
            return (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-5">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Show watermark</p>
                      <p className="text-xs text-muted-foreground">Applies to all certificates, reports and printed lists</p>
                    </div>
                    <Switch
                      checked={wmEnabled}
                      onCheckedChange={(checked) => update('watermark_enabled', checked ? '1' : '0')}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Size</Label>
                      <span className="text-xs text-muted-foreground">{wmSize}px</span>
                    </div>
                    <Slider
                      min={100} max={800} step={20}
                      value={[wmSize]}
                      disabled={!wmEnabled}
                      onValueChange={([v]) => update('watermark_size', String(v))}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Visibility</Label>
                      <span className="text-xs text-muted-foreground">{Math.round(wmOpacity * 100)}%</span>
                    </div>
                    <Slider
                      min={2} max={30} step={1}
                      value={[Math.round(wmOpacity * 100)]}
                      disabled={!wmEnabled}
                      onValueChange={([v]) => update('watermark_opacity', String(v / 100))}
                    />
                    <p className="text-xs text-muted-foreground">Keep it low (5–10%) so the document stays readable.</p>
                  </div>

                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Watermark'}
                  </Button>
                </div>

                {/* Live preview */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative w-[280px] overflow-hidden rounded border bg-white shadow-sm" style={{ aspectRatio: '210 / 297' }}>
                    {wmEnabled && logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Watermark preview"
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
                        style={{
                          width: `${Math.round(wmSize * previewScale)}px`,
                          height: `${Math.round(wmSize * previewScale)}px`,
                          opacity: wmOpacity,
                        }}
                      />
                    ) : null}
                    {/* Fake document lines so the preview reads as a page */}
                    <div className="absolute inset-x-8 top-8 space-y-2.5">
                      <div className="mx-auto h-2 w-32 rounded bg-neutral-200" />
                      <div className="mx-auto h-1.5 w-24 rounded bg-neutral-100" />
                      {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className="h-1.5 rounded bg-neutral-100" style={{ width: `${85 - (i % 4) * 8}%` }} />
                      ))}
                    </div>
                    {!logoPreview && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="px-6 text-center text-xs text-muted-foreground">Upload a barangay logo above to enable the watermark</p>
                      </div>
                    )}
                    {logoPreview && !wmEnabled && (
                      <div className="absolute inset-x-0 bottom-2 text-center text-[10px] text-muted-foreground">Watermark off</div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Preview (A4 page)</p>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Report Header Template */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Report Header Template
          </CardTitle>
          <CardDescription>
            Customize the letterhead that appears at the top of certificates and reports when using the {'{{header}}'} tag.
            Use {'{{barangay}}'}, {'{{municipality}}'}, {'{{province}}'}, and {'{{logo}}'} to auto-fill your barangay details.
            Leave empty to use the default header.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TemplateEditor
            key="header-editor"
            content={settings.header_template || ''}
            onChange={(html) => update('header_template', html)}
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Header'}
            </Button>
            {settings.header_template && (
              <Button variant="outline" onClick={() => {
                update('header_template', '');
                toast.success('Header reset to default');
              }}>
                Reset to Default
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
