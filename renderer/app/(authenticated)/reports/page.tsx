'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileText, Printer, FileDown, FileSpreadsheet } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid,
} from 'recharts';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getAPI, type PaperSettings } from '@/lib/ipc';
import { PaperPreview } from '@/components/paper-preview';
import { toast } from 'sonner';

const PYRAMID_ORDER = ['65+', '55-64', '45-54', '35-44', '25-34', '15-24', '0-14'];

export default function ReportsPage() {
  const [period, setPeriod] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ html: string; paper?: PaperSettings } | null>(null);
  const [pyramid, setPyramid] = useState<{ bracket: string; male: number; female: number }[]>([]);
  const [monthly, setMonthly] = useState<{ month: string; count: number }[]>([]);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.analyticsOverview().then((d) => { setPyramid(d.pyramid || []); setMonthly(d.monthly || []); }).catch(() => {});
  }, []);

  const pyramidData = useMemo(() => {
    const byBracket = new Map(pyramid.map((p) => [p.bracket, p]));
    return PYRAMID_ORDER.map((b) => {
      const row = byBracket.get(b);
      return { bracket: b, Male: -(row?.male || 0), Female: row?.female || 0 };
    });
  }, [pyramid]);

  const generateFormC = async () => {
    const api = getAPI();
    if (!api) return;
    setBusy(true);
    try {
      const res = await api.generateFormC({ period: period || '—' });
      if (res.success && res.html) {
        setPreview({ html: res.html, paper: res.paper });
      } else {
        toast.error(res.error || 'Could not generate Form C');
      }
    } finally {
      setBusy(false);
    }
  };

  const printPreview = async () => {
    const api = getAPI();
    if (!api || !preview) return;
    const r = await api.printReport(preview.html, preview.paper);
    if (r.success) toast.success('Print dialog opened'); else toast.error(r.error || 'Print failed');
  };

  const exportPreview = async () => {
    const api = getAPI();
    if (!api || !preview) return;
    const r = await api.exportPDF(preview.html, 'RBI_Form_C', preview.paper);
    if (r.success) toast.success('PDF saved');
    else if (r.error !== 'Save cancelled') toast.error(r.error || 'Export failed');
  };

  const exportFormCXlsx = async () => {
    const api = getAPI();
    if (!api) return;
    const r = await api.exportFormCXlsx();
    if (r.success) toast.success('Excel saved');
    else if (r.error !== 'Save cancelled') toast.error(r.error || 'Export failed');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Statutory and summary reports for DILG / NGA submission." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              RBI Form C — Semestral Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Demographic and sectoral tally of barangay inhabitants (RBI Form C) for a reporting
              period. The wording and layout are an editable template on the Templates page; only the
              counts are computed. This is the summary DILG expects encoded into BIMS.
            </p>
            <div className="space-y-1 max-w-xs">
              <Label className="text-xs">Covering Period</Label>
              <Input placeholder="e.g. 1st Semester 2026" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9" />
            </div>
            <div className="flex gap-2">
              <Button onClick={generateFormC} disabled={busy}>
                <FileText className="mr-2 h-4 w-4" />{busy ? 'Generating…' : 'Generate Form C'}
              </Button>
              <Button variant="outline" onClick={exportFormCXlsx}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />Excel (.xlsx)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Analytics ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Population Pyramid (age × sex)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pyramidData} layout="vertical" stackOffset="sign" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tickFormatter={(v) => String(Math.abs(v))} />
                <YAxis type="category" dataKey="bracket" width={48} />
                <Tooltip formatter={(value: any) => String(Math.abs(Number(value)))} />
                <Legend />
                <Bar dataKey="Male" fill="#3b82f6" stackId="pyramid" />
                <Bar dataKey="Female" fill="#ec4899" stackId="pyramid" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">New Residents (last 12 months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthly} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>RBI Form C — Semestral Summary</DialogTitle>
            <DialogDescription>Review, print, or export the generated summary.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto rounded-md bg-neutral-200 p-6 dark:bg-neutral-900">
            {preview && <PaperPreview html={preview.html} />}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
            <Button variant="outline" onClick={printPreview}><Printer className="mr-2 h-4 w-4" />Print</Button>
            <Button onClick={exportPreview}><FileDown className="mr-2 h-4 w-4" />Save as PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
