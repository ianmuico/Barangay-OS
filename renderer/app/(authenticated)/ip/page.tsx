'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { SECTORAL_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function IpPage() {
  const config: CategoryConfig = useMemo(() => ({
    pageKey: 'ip',
    title: 'Indigenous People (IP)',
    description: 'Residents registered as members of an indigenous group',
    searchPlaceholder: 'Search indigenous residents...',
    filterParams: { is_ip: true },
    showIndigentColumn: true,
    showExport: true,
    extraColumns: [
      {
        accessorKey: 'ethnicity',
        header: 'Ethnicity',
        cell: ({ row }: any) => row.original.ethnicity
          ? <span className="text-xs">{row.original.ethnicity}</span>
          : <span className="text-muted-foreground text-xs">—</span>,
      },
    ],
    printConfig: {
      groupOptions: SECTORAL_GROUP_OPTIONS,
      extraColumns: [{ key: 'ethnicity', label: 'Ethnicity' }],
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
