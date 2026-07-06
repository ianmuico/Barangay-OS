'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { getAPI, type DashboardStats, type DetailedStats, type Official } from '@/lib/ipc';
import { toast } from 'sonner';

// ─── Types ───
interface SummaryReportDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ReportData {
  stats: DashboardStats;
  detailed: DetailedStats;
  settings: Record<string, string>;
  totalHouseholds: number;
  totalVoters: number;
  maleCount: number;
  femaleCount: number;
  childrenCount: number;
  adultCount: number;
  officials: Official[];
  logo: string | null;
}

// ─── Helpers ───
const fmt = (n: number) => (n || 0).toLocaleString();

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getAgeBracketCount(ageDistribution: { bracket: string; count: number }[], brackets: string[]): number {
  return ageDistribution.filter(a => brackets.includes(a.bracket)).reduce((sum, a) => sum + a.count, 0);
}

const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#14b8a6', '#6366f1', '#d946ef'];

// ─── Inline-SVG charts (print-safe; no JS needed) ───

function donutSVG(segments: { label: string; value: number; color: string }[], centerLabel: string, centerSub: string): string {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const size = 150, stroke = 24, r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  let acc = 0;
  const arcs = segments.filter(s => s.value > 0).map(s => {
    const frac = s.value / total, dash = frac * c, rot = acc * 360 - 90;
    acc += frac;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" transform="rotate(${rot.toFixed(2)} ${cx} ${cy})"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef1f5" stroke-width="${stroke}"/>
    ${arcs}
    <text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="24" font-weight="800" fill="#111827">${centerLabel}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="9.5" fill="#6b7280">${centerSub}</text>
  </svg>`;
}

function legend(items: { label: string; value: number; color: string }[]): string {
  return `<div style="display:flex;flex-direction:column;gap:6px;">${items.map(i => `
    <div style="display:flex;align-items:center;gap:8px;font-size:12px;">
      <span style="width:10px;height:10px;border-radius:3px;background:${i.color};display:inline-block;"></span>
      <span style="color:#374151;flex:1;">${i.label}</span>
      <span style="font-weight:700;color:#111827;">${fmt(i.value)}</span>
    </div>`).join('')}</div>`;
}

function vBarsSVG(items: { label: string; value: number; color: string }[]): string {
  const w = 460, h = 170, padB = 30, padT = 20, padX = 6;
  const max = Math.max(1, ...items.map(i => i.value));
  const n = items.length, gap = 22, bw = (w - padX * 2 - gap * (n - 1)) / n, chartH = h - padB - padT;
  const bars = items.map((it, i) => {
    const bh = Math.round((it.value / max) * chartH);
    const x = padX + i * (bw + gap), y = padT + chartH - bh;
    return `<g>
      <rect x="${x}" y="${padT}" width="${bw}" height="${chartH}" rx="6" fill="#f1f4f8"/>
      <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${it.color}"/>
      <text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="13" font-weight="800" fill="#111827">${fmt(it.value)}</text>
      <text x="${x + bw / 2}" y="${h - 10}" text-anchor="middle" font-size="11" fill="#6b7280">${it.label}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block">${bars}</svg>`;
}

function hBarsSVG(items: { label: string; value: number }[], color: string): string {
  const rowH = 26, w = 460, labelW = 120;
  const max = Math.max(1, ...items.map(i => i.value));
  const barAreaW = w - labelW - 44, h = items.length * rowH + 4;
  const rows = items.map((it, i) => {
    const y = i * rowH + 2, bw = Math.max(3, Math.round((it.value / max) * barAreaW));
    return `<g>
      <text x="0" y="${y + rowH / 2}" dominant-baseline="middle" font-size="11.5" fill="#374151">${it.label}</text>
      <rect x="${labelW}" y="${y + 5}" width="${barAreaW}" height="${rowH - 12}" rx="4" fill="#f1f4f8"/>
      <rect x="${labelW}" y="${y + 5}" width="${bw}" height="${rowH - 12}" rx="4" fill="${color}"/>
      <text x="${w}" y="${y + rowH / 2}" text-anchor="end" dominant-baseline="middle" font-size="11.5" font-weight="700" fill="#111827">${fmt(it.value)}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block">${rows}</svg>`;
}

function gaugeSVG(pct: number, label: string): string {
  const size = 150, stroke = 24, r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  const dash = (pct / 100) * c;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef1f5" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#6366f1" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="26" font-weight="800" fill="#111827">${pct}%</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="9.5" fill="#6b7280">${label}</text>
  </svg>`;
}

// ─── Report builder (modern, sans-serif, with charts) ───

function buildReportHTML(data: ReportData): string {
  const { stats, detailed, settings, totalHouseholds, totalVoters, maleCount, femaleCount, childrenCount, adultCount, officials, logo } = data;
  const barangayName = settings.barangay_name || 'Barangay';
  const locationParts = [settings.municipality, settings.province].filter(Boolean).join(', ');
  const today = formatDate(new Date());
  const total = stats.totalResidents || 0;
  const voterPct = total > 0 ? Math.round((totalVoters / total) * 100) : 0;
  const activeCases = (detailed.caseStats?.pending ?? 0) + (detailed.caseStats?.ongoing ?? 0);

  const section = (title: string, accent: string, body: string) => `
    <section style="break-inside:avoid;margin-bottom:18px;">
      <div style="display:flex;align-items:center;gap:8px;margin:0 0 10px;">
        <span style="width:4px;height:16px;border-radius:2px;background:${accent};display:inline-block;"></span>
        <h2 style="margin:0;font-size:13.5px;font-weight:800;color:#111827;letter-spacing:.3px;text-transform:uppercase;">${title}</h2>
      </div>
      ${body}
    </section>`;

  const card = (inner: string, pad = 16) => `<div style="background:#f9fafb;border:1px solid #edf0f4;border-radius:12px;padding:${pad}px;">${inner}</div>`;

  const kpi = (label: string, value: string, sub: string, color: string) => `
    <div style="flex:1;background:#f9fafb;border:1px solid #edf0f4;border-radius:12px;padding:13px 15px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7280;">${label}</div>
      <div style="font-size:24px;font-weight:800;color:${color};margin-top:3px;line-height:1.1;">${value}</div>
      <div style="font-size:10.5px;color:#9ca3af;margin-top:1px;">${sub}</div>
    </div>`;

  const tile = (label: string, value: string, color: string) => `
    <div style="flex:1;border:1px solid #edf0f4;border-radius:10px;padding:11px 13px;background:#fff;">
      <div style="font-size:19px;font-weight:800;color:${color};">${value}</div>
      <div style="font-size:10.5px;color:#6b7280;margin-top:1px;">${label}</div>
    </div>`;

  // Gender
  const genderSegs = [
    { label: 'Male', value: maleCount, color: '#3b82f6' },
    { label: 'Female', value: femaleCount, color: '#ec4899' },
  ];

  // Age
  const ageItems = [
    { label: 'Children', value: childrenCount, color: '#06b6d4' },
    { label: 'Youth', value: stats.totalYouth, color: '#16a34a' },
    { label: 'Adults', value: adultCount, color: '#f59e0b' },
    { label: 'Seniors', value: stats.totalSeniors, color: '#8b5cf6' },
  ];

  // Civil status (top entries)
  const civil = (detailed.civilStatusDistribution || []).slice(0, 6).map(c => ({ label: c.status, value: c.count }));

  // Purok
  const puroks = [...detailed.residentsByPurok]
    .sort((a, b) => (a.purok || '').localeCompare(b.purok || '', undefined, { numeric: true }))
    .map(p => ({ label: p.purok ? `Purok ${p.purok}` : 'Unassigned', value: p.count }));
  const purokTotal = detailed.residentsByPurok.reduce((s, p) => s + p.count, 0);

  const captain = officials.find(o => /punong|captain|chairman/i.test(o.position));
  const captainName = captain ? [captain.first_name, captain.last_name].filter(Boolean).join(' ').toUpperCase() : '';

  const logoImg = logo ? `<img src="${logo}" style="width:46px;height:46px;object-fit:contain;border-radius:8px;background:#fff;padding:3px;" />` : '';

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:12px;line-height:1.5;">

    <!-- Header band -->
    <div style="display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#1e3a5f 0%,#2d5a8f 100%);color:#fff;border-radius:14px;padding:18px 22px;margin-bottom:18px;">
      ${logoImg}
      <div style="flex:1;">
        <div style="font-size:11px;letter-spacing:.5px;opacity:.85;">Republic of the Philippines${locationParts ? ` · ${locationParts}` : ''}</div>
        <div style="font-size:22px;font-weight:800;letter-spacing:.3px;margin-top:1px;">Barangay ${barangayName}</div>
        <div style="font-size:12.5px;font-weight:600;opacity:.95;margin-top:2px;">Demographic Summary Report</div>
      </div>
      <div style="text-align:right;font-size:11px;opacity:.9;">As of<br/><span style="font-size:13px;font-weight:700;">${today}</span></div>
    </div>

    <!-- KPI row -->
    <div style="display:flex;gap:10px;margin-bottom:20px;">
      ${kpi('Total Residents', fmt(total), 'living residents', '#1e3a5f')}
      ${kpi('Households', fmt(totalHouseholds), 'registered', '#16a34a')}
      ${kpi('Registered Voters', `${voterPct}%`, `${fmt(totalVoters)} voters`, '#6366f1')}
      ${kpi('Active Cases', fmt(activeCases), 'pending + ongoing', '#ef4444')}
    </div>

    <!-- Population + Age (two columns) -->
    <div style="display:flex;gap:14px;margin-bottom:18px;break-inside:avoid;">
      <div style="flex:1;">
        ${section('Population', '#3b82f6', card(`
          <div style="display:flex;align-items:center;gap:14px;">
            ${donutSVG(genderSegs, fmt(total), 'residents')}
            <div style="flex:1;">${legend([
              ...genderSegs,
              { label: 'Deceased (on record)', value: detailed.deceasedCount ?? 0, color: '#9ca3af' },
            ])}</div>
          </div>`))}
      </div>
      <div style="flex:1;">
        ${section('Age Demographics', '#8b5cf6', card(vBarsSVG(ageItems)))}
      </div>
    </div>

    <!-- Special categories -->
    ${section('Special Categories', '#f59e0b', `
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        ${tile('Indigent residents', fmt(stats.totalIndigents), '#f59e0b')}
        ${tile('4Ps beneficiaries', fmt(stats.total4Ps), '#16a34a')}
        ${tile('Persons with Disability', fmt(stats.totalPWD ?? 0), '#8b5cf6')}
        ${tile('Senior citizens', fmt(stats.totalSeniors), '#0ea5e9')}
      </div>
      <div style="display:flex;gap:14px;align-items:center;">
        ${card(`<div style="display:flex;align-items:center;gap:14px;"><div>${gaugeSVG(voterPct, 'registered')}</div><div style="font-size:12px;color:#374151;">Voter registration<br/><span style="font-size:18px;font-weight:800;color:#111827;">${fmt(totalVoters)}</span> of ${fmt(total)}</div></div>`)}
        <div style="flex:1;">${civil.length ? card(`<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Civil Status</div>${hBarsSVG(civil, '#14b8a6')}`) : ''}</div>
      </div>`)}

    <!-- Per purok -->
    ${puroks.length ? section('Population by Purok', '#16a34a', card(`
      ${hBarsSVG(puroks, '#2563eb')}
      <div style="text-align:right;font-size:11px;color:#6b7280;margin-top:8px;border-top:1px solid #e5e7eb;padding-top:6px;">Total: <span style="font-weight:800;color:#111827;">${fmt(purokTotal)}</span> residents across ${puroks.length} purok(s)</div>`)) : ''}

    <!-- Cases -->
    ${detailed.caseStats ? section('Katarungang Pambarangay', '#ef4444', `
      <div style="display:flex;gap:10px;">
        ${tile('Total cases', fmt(detailed.caseStats.total), '#111827')}
        ${tile('Pending', fmt(detailed.caseStats.pending), '#f59e0b')}
        ${tile('Ongoing', fmt(detailed.caseStats.ongoing), '#3b82f6')}
        ${tile('Resolved', fmt(detailed.caseStats.resolved), '#16a34a')}
        ${tile('Dismissed', fmt(detailed.caseStats.dismissed), '#6b7280')}
      </div>`) : ''}

    <!-- Footer / signature -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;break-inside:avoid;">
      <div style="font-size:10.5px;color:#9ca3af;">Generated ${today}<br/>Barangay Management System</div>
      <div style="text-align:center;min-width:230px;">
        <div style="font-size:10.5px;color:#6b7280;margin-bottom:30px;">Prepared &amp; certified by:</div>
        <div style="border-top:1.5px solid #111827;padding-top:5px;">
          <div style="font-size:13px;font-weight:800;color:#111827;">${captainName || '________________________'}</div>
          <div style="font-size:11px;color:#6b7280;">Punong Barangay</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ─── Component ───

export function SummaryReportDialog({ open, onClose }: SummaryReportDialogProps) {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportHTML, setReportHTML] = useState('');
  const [activeMode, setActiveMode] = useState<'print' | 'pdf' | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    const api = getAPI();
    if (!api) return;

    setLoading(true);
    try {
      const [stats, detailed, settings, logo] = await Promise.all([
        api.getDashboardStats(),
        api.getDetailedStats(),
        api.getAllSettings(),
        api.getLogoBase64().catch(() => null),
      ]);

      const maleCount = detailed.genderDistribution.find(g => g.gender.toLowerCase() === 'male')?.count ?? 0;
      const femaleCount = detailed.genderDistribution.find(g => g.gender.toLowerCase() === 'female')?.count ?? 0;

      let totalVoters = detailed.voterStats?.registered ?? -1;
      if (totalVoters < 0) {
        const voterRes = await api.getResidents({ status: 'living', page: 1, limit: 99999 });
        totalVoters = voterRes.data.filter(r => r.voter_status && r.voter_status.toLowerCase() === 'registered').length;
      }

      const officials = (await api.getOfficials()).filter(o => o.is_active);
      const allHouseholds = await api.getHouseholds({});
      const totalHouseholds = Array.isArray(allHouseholds) ? allHouseholds.length : 0;
      const childrenCount = getAgeBracketCount(detailed.ageDistribution, ['0-14']);
      const adultCount = getAgeBracketCount(detailed.ageDistribution, ['31-59']);

      const data: ReportData = {
        stats, detailed, settings, totalHouseholds, totalVoters,
        maleCount, femaleCount, childrenCount, adultCount, officials, logo,
      };
      setReportData(data);
      setReportHTML(buildReportHTML(data));
    } catch (err) {
      console.error('Failed to load summary report data:', err);
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
    else { setReportData(null); setReportHTML(''); }
  }, [open, fetchData]);

  const handlePrint = async () => {
    if (!reportHTML) return;
    const api = getAPI();
    if (!api) return;
    setActiveMode('print');
    try {
      const result = await api.printReport(reportHTML);
      if (result.success) toast.success('Report sent to printer');
      else toast.error(result.error || 'Failed to print');
    } finally { setActiveMode(null); }
  };

  const handleExportPDF = async () => {
    if (!reportHTML) return;
    const api = getAPI();
    if (!api) return;
    setActiveMode('pdf');
    try {
      const barangayName = reportData?.settings.barangay_name || 'Barangay';
      const filename = `${barangayName}_Summary_Report_${new Date().toISOString().slice(0, 10)}`;
      const result = await api.exportPDF(reportHTML, filename);
      if (result.success) toast.success('PDF saved successfully');
      else if (result.error !== 'Save cancelled') toast.error(result.error || 'Failed to export PDF');
    } finally { setActiveMode(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Barangay Summary Report</DialogTitle>
          <DialogDescription>Demographic summary with charts. Print or save as PDF.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-sm text-muted-foreground">Loading report data...</span>
          </div>
        ) : reportHTML ? (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={activeMode !== null}>
                {activeMode === 'pdf' ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>) : (<><Download className="mr-2 h-4 w-4" />Save PDF</>)}
              </Button>
              <Button size="sm" onClick={handlePrint} disabled={activeMode !== null}>
                {activeMode === 'print' ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Printing...</>) : (<><Printer className="mr-2 h-4 w-4" />Print</>)}
              </Button>
            </div>

            <div ref={previewRef} className="bg-neutral-200 dark:bg-neutral-900 p-6 rounded-md overflow-auto max-h-[62vh]">
              <div className="mx-auto bg-white text-black shadow-sm" style={{ width: '794px', minHeight: '1000px', padding: '48px 52px' }}>
                <div dangerouslySetInnerHTML={{ __html: reportHTML }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">No data available. Please add residents first.</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
