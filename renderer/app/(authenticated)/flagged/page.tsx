'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flag, Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ResidentDetailDialog } from '@/components/resident-detail-dialog';
import { getAPI, type FlaggedResident } from '@/lib/ipc';

// Watchlist: residents flagged with open issues recorded by the admin —
// separate from formal Katarungang Pambarangay cases.
export default function FlaggedResidentsPage() {
  const [rows, setRows] = useState<FlaggedResident[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchRows = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    setRows(await api.getFlaggedResidents(debounced || undefined));
  }, [debounced]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Refresh after the dialog closes (issues may have been resolved/added)
  useEffect(() => {
    if (!detailOpen) fetchRows();
  }, [detailOpen, fetchRows]);

  const name = (r: FlaggedResident) => [r.first_name, r.last_name, r.suffix].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <PageHeader title="Flagged Residents" description="Residents with open issues noted by the barangay — click a person to review, resolve, or add issues." />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search flagged residents..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!rows ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16">
            <Flag className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {debounced ? 'No flagged residents match your search.' : 'No residents currently flagged. Open a resident’s profile and use the Issues tab to flag one.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Resident</th>
                <th className="px-4 py-3 text-left font-medium">Purok</th>
                <th className="px-4 py-3 text-left font-medium">Latest Issue</th>
                <th className="px-4 py-3 text-center font-medium">Open Issues</th>
                <th className="px-4 py-3 text-center font-medium">Cases</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b transition-colors hover:bg-muted/30"
                  onClick={() => { setDetailId(r.id); setDetailOpen(true); }}
                >
                  <td className="px-4 py-2.5 font-medium">{name(r)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.purok ? `Purok ${r.purok}` : '—'}</td>
                  <td className="max-w-[280px] truncate px-4 py-2.5 text-muted-foreground" title={r.latest_issue || ''}>
                    {r.latest_issue || '—'}
                    {r.latest_issue_at && <span className="ml-1 text-[11px]">({new Date(r.latest_issue_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })})</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      ⚑ {r.open_issues}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {r.case_count > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        ⚖ {r.case_count}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ResidentDetailDialog residentId={detailId} open={detailOpen} onOpenChange={setDetailOpen} initialTab="issues" pageKey="flagged" />
    </div>
  );
}
