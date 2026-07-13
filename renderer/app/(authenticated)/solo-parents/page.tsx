'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { SECTORAL_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function SoloParentsPage() {
  const config: CategoryConfig = useMemo(() => ({
    pageKey: 'solo-parents',
    title: 'Solo Parents',
    description: 'Residents registered as solo parents (RA 8972)',
    searchPlaceholder: 'Search solo parents...',
    filterParams: { is_solo_parent: true },
    showIndigentColumn: true,
    showExport: true,
    printConfig: {
      groupOptions: SECTORAL_GROUP_OPTIONS,
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
