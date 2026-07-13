'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { SECTORAL_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function OsyPage() {
  const config: CategoryConfig = useMemo(() => ({
    pageKey: 'osy',
    title: 'Out-of-School Youth',
    description: 'Residents registered as out-of-school youth (OSY)',
    searchPlaceholder: 'Search out-of-school youth...',
    filterParams: { is_osy: true },
    showIndigentColumn: true,
    showExport: true,
    printConfig: {
      groupOptions: SECTORAL_GROUP_OPTIONS,
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
