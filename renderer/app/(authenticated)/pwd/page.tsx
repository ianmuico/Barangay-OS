'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { PWD_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function PwdPage() {
  const config: CategoryConfig = useMemo(() => ({
    pageKey: 'pwd',
    title: 'Persons with Disability (PWD)',
    description: 'Residents flagged as PWD (RA 10754)',
    searchPlaceholder: 'Search PWD residents...',
    filterParams: { is_pwd: true },
    showIndigentColumn: true,
    showExport: true,
    extraColumns: [
      {
        accessorKey: 'pwd_note',
        header: 'PWD Note',
        cell: ({ row }: any) => row.original.pwd_note
          ? <span className="text-xs">{row.original.pwd_note}</span>
          : <span className="text-muted-foreground text-xs">—</span>,
      },
    ],
    printConfig: {
      groupOptions: PWD_GROUP_OPTIONS,
      extraColumns: [{ key: 'pwd_note', label: 'PWD Note' }],
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
