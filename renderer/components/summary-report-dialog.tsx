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
}

// ─── Helpers ───

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getAgeBracketCount(
  ageDistribution: { bracket: string; count: number }[],
  brackets: string[],
): number {
  return ageDistribution
    .filter(a => brackets.includes(a.bracket))
    .reduce((sum, a) => sum + a.count, 0);
}

// ─── HTML Report Builder ───

function buildReportHTML(data: ReportData): string {
  const {
    stats,
    detailed,
    settings,
    totalHouseholds,
    totalVoters,
    maleCount,
    femaleCount,
    childrenCount,
    adultCount,
    officials,
  } = data;

  const barangayName = settings.barangay_name || 'Barangay';
  const municipality = settings.municipality || '';
  const province = settings.province || '';
  const today = formatDate(new Date());

  const locationParts = [municipality, province].filter(Boolean).join(', ');

  // Build per-purok table rows
  const purokRows = detailed.residentsByPurok
    .sort((a, b) => a.purok.localeCompare(b.purok))
    .map(
      (p, i) => `
      <tr>
        <td style="border:1px solid #333; padding:4px 8px; text-align:center;">${i + 1}</td>
        <td style="border:1px solid #333; padding:4px 8px;">${p.purok || 'Unassigned'}</td>
        <td style="border:1px solid #333; padding:4px 8px; text-align:center;">${p.count}</td>
      </tr>`,
    )
    .join('');

  return `
    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #000; max-width: 210mm; margin: 0 auto; padding: 20mm 15mm;">

      <!-- Header -->
      <div style="text-align: center; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 11pt;">Republic of the Philippines</p>
        ${locationParts ? `<p style="margin: 0; font-size: 11pt;">${locationParts}</p>` : ''}
        <h2 style="margin: 8px 0 4px; font-size: 16pt; font-weight: bold;">BARANGAY ${barangayName.toUpperCase()}</h2>
        <hr style="border: none; border-top: 2px solid #000; margin: 8px auto; width: 60%;" />
        <h3 style="margin: 12px 0 4px; font-size: 14pt; font-weight: bold; text-decoration: underline;">CAPTAIN'S SUMMARY REPORT</h3>
        <p style="margin: 4px 0; font-size: 11pt;">As of ${today}</p>
      </div>

      <!-- Population Summary -->
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 12pt; font-weight: bold; margin: 0 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">I. POPULATION SUMMARY</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 12pt;">
          <tr>
            <td style="padding: 3px 8px; width: 60%;">Total Residents (Living)</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${stats.totalResidents}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">Male</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${maleCount}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">Female</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${femaleCount}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">Total Households</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${totalHouseholds}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">Deceased (on record)</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${detailed.deceasedCount ?? 0}</td>
          </tr>
          ${(detailed.civilStatusDistribution || []).map(c => `
          <tr>
            <td style="padding: 3px 8px; padding-left: 24px; color: #444;">${c.status}</td>
            <td style="padding: 3px 8px; text-align: right;">${c.count}</td>
          </tr>`).join('')}
        </table>
      </div>

      <!-- Age Demographics -->
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 12pt; font-weight: bold; margin: 0 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">II. AGE DEMOGRAPHICS</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 12pt;">
          <tr>
            <td style="padding: 3px 8px; width: 60%;">Children (0-14)</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${childrenCount}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">Youth (15-30)</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${stats.totalYouth}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">Adults (31-59)</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${adultCount}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">Seniors (60+)</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${stats.totalSeniors}</td>
          </tr>
        </table>
      </div>

      <!-- Special Categories -->
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 12pt; font-weight: bold; margin: 0 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">III. SPECIAL CATEGORIES</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 12pt;">
          <tr>
            <td style="padding: 3px 8px; width: 60%;">Indigent Residents</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${stats.totalIndigents}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">4Ps Beneficiaries</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${stats.total4Ps}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px;">Registered Voters</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${totalVoters}${stats.totalResidents > 0 ? ` (${Math.round((totalVoters / stats.totalResidents) * 100)}%)` : ''}</td>
          </tr>
        </table>
      </div>

      <!-- Per-Purok Breakdown -->
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 12pt; font-weight: bold; margin: 0 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">IV. PER-PUROK BREAKDOWN</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 12pt;">
          <thead>
            <tr style="background-color: #f0f0f0;">
              <th style="border:1px solid #333; padding:6px 8px; text-align:center; width: 50px;">#</th>
              <th style="border:1px solid #333; padding:6px 8px; text-align:left;">Purok</th>
              <th style="border:1px solid #333; padding:6px 8px; text-align:center; width: 100px;">Residents</th>
            </tr>
          </thead>
          <tbody>
            ${purokRows}
            <tr style="font-weight: bold; background-color: #f0f0f0;">
              <td style="border:1px solid #333; padding:4px 8px;" colspan="2">TOTAL</td>
              <td style="border:1px solid #333; padding:4px 8px; text-align:center;">${detailed.residentsByPurok.reduce((s, p) => s + p.count, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Cases & Summons -->
      ${detailed.caseStats ? `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 12pt; font-weight: bold; margin: 0 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">V. KATARUNGANG PAMBARANGAY (CASES)</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 12pt;">
          <tr>
            <td style="padding: 3px 8px; width: 60%;">Total Cases Filed</td>
            <td style="padding: 3px 8px; font-weight: bold; text-align: right;">${detailed.caseStats.total}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px; padding-left: 24px; color: #444;">Pending</td>
            <td style="padding: 3px 8px; text-align: right;">${detailed.caseStats.pending}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px; padding-left: 24px; color: #444;">Ongoing</td>
            <td style="padding: 3px 8px; text-align: right;">${detailed.caseStats.ongoing}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px; padding-left: 24px; color: #444;">Resolved</td>
            <td style="padding: 3px 8px; text-align: right;">${detailed.caseStats.resolved}</td>
          </tr>
          <tr>
            <td style="padding: 3px 8px; padding-left: 24px; color: #444;">Dismissed</td>
            <td style="padding: 3px 8px; text-align: right;">${detailed.caseStats.dismissed}</td>
          </tr>
        </table>
      </div>` : ''}

      <!-- Footer -->
      <div style="margin-top: 40px;">
        <p style="font-size: 11pt; color: #555;">Report generated on ${today}</p>
        <div style="margin-top: 40px;">
          <p style="margin: 0; font-size: 11pt;">Prepared by:</p>
          <div style="margin-top: 32px; width: 250px;">
            <hr style="border: none; border-top: 1px solid #000; margin-bottom: 4px;" />
            <p style="margin: 0; font-size: 11pt; text-align: center; font-weight: bold;">${(() => {
              const pb = officials.find(o => /punong|captain|chairman/i.test(o.position));
              return pb ? [pb.first_name, pb.last_name].filter(Boolean).join(' ').toUpperCase() : '';
            })()}</p>
            <p style="margin: 0; font-size: 11pt; text-align: center;">Punong Barangay</p>
          </div>
        </div>
      </div>
    </div>
  `;
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
      const [stats, detailed, settings, households, voterResult] = await Promise.all([
        api.getDashboardStats(),
        api.getDetailedStats(),
        api.getAllSettings(),
        api.getHouseholds({ page: 1, limit: 1 }),
        api.getResidents({ status: 'living', page: 1, limit: 1 }),
      ]);

      // Extract gender counts
      const maleEntry = detailed.genderDistribution.find(
        g => g.gender.toLowerCase() === 'male',
      );
      const femaleEntry = detailed.genderDistribution.find(
        g => g.gender.toLowerCase() === 'female',
      );
      const maleCount = maleEntry?.count ?? 0;
      const femaleCount = femaleEntry?.count ?? 0;

      // Voter count comes from the stats endpoint; fall back to a full scan
      let totalVoters = detailed.voterStats?.registered ?? -1;
      if (totalVoters < 0) {
        const voterRes = await api.getResidents({ status: 'living', page: 1, limit: 99999 });
        totalVoters = voterRes.data.filter(
          r => r.voter_status && r.voter_status.toLowerCase() === 'registered',
        ).length;
      }

      const officials = (await api.getOfficials()).filter(o => o.is_active);

      // Count households
      const allHouseholds = await api.getHouseholds({});
      const totalHouseholds = Array.isArray(allHouseholds) ? allHouseholds.length : 0;

      // Compute age bracket counts from ageDistribution
      // Typical brackets from the API: "0-14", "15-30", "31-59", "60+"
      const childrenCount = getAgeBracketCount(detailed.ageDistribution, ['0-14']);
      const adultCount = getAgeBracketCount(detailed.ageDistribution, ['31-59']);

      const data: ReportData = {
        stats,
        detailed,
        settings,
        totalHouseholds,
        totalVoters,
        maleCount,
        femaleCount,
        childrenCount,
        adultCount,
        officials,
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
    if (open) {
      fetchData();
    } else {
      setReportData(null);
      setReportHTML('');
    }
  }, [open, fetchData]);

  const handlePrint = async () => {
    if (!reportHTML) return;
    const api = getAPI();
    if (!api) return;

    setActiveMode('print');
    try {
      const result = await api.printReport(reportHTML);
      if (result.success) {
        toast.success('Report sent to printer');
      } else {
        toast.error(result.error || 'Failed to print');
      }
    } finally {
      setActiveMode(null);
    }
  };

  const handleExportPDF = async () => {
    if (!reportHTML) return;
    const api = getAPI();
    if (!api) return;

    setActiveMode('pdf');
    try {
      const barangayName = reportData?.settings.barangay_name || 'Barangay';
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${barangayName}_Summary_Report_${dateStr}`;

      const result = await api.exportPDF(reportHTML, filename);
      if (result.success) {
        toast.success('PDF saved successfully');
      } else {
        if (result.error !== 'Save cancelled') {
          toast.error(result.error || 'Failed to export PDF');
        }
      }
    } finally {
      setActiveMode(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Captain&apos;s Summary Report</DialogTitle>
          <DialogDescription>
            Barangay demographic summary report preview. Print or save as PDF.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-sm text-muted-foreground">Loading report data...</span>
          </div>
        ) : reportHTML ? (
          <div className="space-y-4">
            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={activeMode !== null}
              >
                {activeMode === 'pdf' ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                ) : (
                  <><Download className="mr-2 h-4 w-4" />Save PDF</>
                )}
              </Button>
              <Button
                size="sm"
                onClick={handlePrint}
                disabled={activeMode !== null}
              >
                {activeMode === 'print' ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Printing...</>
                ) : (
                  <><Printer className="mr-2 h-4 w-4" />Print</>
                )}
              </Button>
            </div>

            {/* Report preview */}
            <div
              ref={previewRef}
              className="bg-neutral-100 dark:bg-neutral-900 p-6 rounded-md overflow-auto max-h-[60vh]"
            >
              <div className="mx-auto bg-white text-black border border-neutral-300 shadow-sm" style={{ width: '794px', minHeight: '1123px', padding: '96px 72px', fontFamily: "'Times New Roman', Times, serif", fontSize: '12pt', lineHeight: 1.6 }}>
                <div dangerouslySetInnerHTML={{ __html: reportHTML }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No data available. Please add residents first.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
