'use client';

import { useState } from 'react';
import { Upload, ShieldCheck, AlertTriangle, FileSpreadsheet, Info } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

type Validation = { total: number; okCount: number; issues: { name: string; missing: string[] }[] };

export default function BimsExportPage() {
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<Validation | null>(null);

  const runValidate = async () => {
    const api = getAPI();
    if (!api) return;
    setBusy(true);
    try {
      setValidation(await api.bimsValidate());
    } finally { setBusy(false); }
  };

  const runExport = async () => {
    const api = getAPI();
    if (!api) return;
    setBusy(true);
    try {
      const r = await api.bimsExport();
      if (r.success) toast.success(`Exported ${r.count} residents to ${r.path}`);
      else if (r.error !== 'Save cancelled') toast.error(r.error || 'Export failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Export to BIMS" description="Produce a BIMS-ready (RBI-aligned) Excel workbook for upload into DILG LGUSS-BIMS." />

      <Card className="border-l-4 border-l-primary">
        <CardContent className="flex gap-3 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">How this works</p>
            <p className="text-muted-foreground">
              DILG BIMS has no public API — data goes in only through its own prescribed Excel template,
              uploaded by an authorized barangay user. This tool exports your living residents into an
              RBI-aligned <span className="font-mono text-xs">.xlsx</span>. Before uploading, get your
              barangay&rsquo;s prescribed template from your DILG Information System Analyst (ISA) and
              match the column headers. The mapping lives in one file and is easy to adjust.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />1. Check data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Dry-run: find residents missing BIMS-required fields (Last Name, First Name, Sex, Date of Birth).</p>
            <Button variant="outline" onClick={runValidate} disabled={busy}>{busy ? 'Checking…' : 'Check data'}</Button>
            {validation && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <Badge variant="secondary">{validation.total} residents</Badge>
                  <Badge className="bg-emerald-600">{validation.okCount} ready</Badge>
                  {validation.issues.length > 0 && <Badge className="bg-amber-600">{validation.issues.length} with gaps</Badge>}
                </div>
                {validation.issues.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto rounded-md border text-xs">
                    {validation.issues.map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 border-b px-3 py-1.5 last:border-b-0">
                        <span className="truncate"><AlertTriangle className="mr-1 inline h-3 w-3 text-amber-600" />{it.name}</span>
                        <span className="shrink-0 text-muted-foreground">missing: {it.missing.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-emerald-600">All residents have the required fields.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-4 w-4 text-primary" />2. Export workbook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Generate the RBI-aligned <span className="font-mono text-xs">.xlsx</span> for all living residents, then upload it into BIMS from a browser.</p>
            <Button onClick={runExport} disabled={busy}><Upload className="mr-2 h-4 w-4" />{busy ? 'Exporting…' : 'Export to BIMS (.xlsx)'}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
