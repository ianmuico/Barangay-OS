'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { FOURPS_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function FourPsPage() {
  const config: CategoryConfig = useMemo(() => ({
    pageKey: 'four-ps',
    title: '4Ps Beneficiaries',
    description: 'Pantawid Pamilyang Pilipino Program beneficiaries',
    searchPlaceholder: 'Search 4Ps beneficiaries...',
    filterParams: { is_4ps: true },
    showIndigentColumn: true,
    showExport: true,
    printConfig: {
      groupOptions: FOURPS_GROUP_OPTIONS,
      extraColumns: [{ key: 'is_indigent', label: 'Indigent' }],
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
