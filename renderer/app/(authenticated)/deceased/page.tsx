'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';

// Keywords that flag templates as clearly case/complaint-related (exclude from deceased page)
const CASE_TEMPLATE_KEYWORDS = ['summon', 'sumbong', 'pagtawag', 'minutas', 'complaint', 'mediation'];

export default function DeceasedPage() {
  const config: CategoryConfig = useMemo(() => ({
    pageKey: 'deceased',
    title: 'Deceased Records',
    description: 'Archive of deceased residents — not counted in demographics',
    searchPlaceholder: 'Search deceased records...',
    filterParams: { status: 'deceased' },
    showExport: true,
    extraColumns: [
      {
        accessorKey: 'middle_name',
        header: 'Middle Name',
        cell: ({ row }: any) => row.original.middle_name || '-',
      },
      {
        accessorKey: 'death_date',
        header: 'Date of Death',
        cell: ({ row }: any) => {
          const d: string | null | undefined = row.original.death_date;
          if (!d) return <span className="text-muted-foreground text-xs">—</span>;
          try {
            return new Date(d).toLocaleDateString('en-PH', {
              year: 'numeric', month: 'short', day: 'numeric',
            });
          } catch {
            return d;
          }
        },
      },
    ],
    // Exclude case/complaint-related templates; keep general + death-related ones
    reportTemplateFilter: (t) => {
      const name = t.name.toLowerCase();
      return !CASE_TEMPLATE_KEYWORDS.some((kw) => name.includes(kw));
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
