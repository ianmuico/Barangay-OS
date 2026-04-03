'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';

export default function FourPsPage() {
  const config: CategoryConfig = useMemo(() => ({
    title: '4Ps Beneficiaries',
    description: 'Pantawid Pamilyang Pilipino Program beneficiaries',
    searchPlaceholder: 'Search 4Ps beneficiaries...',
    filterParams: { is_4ps: true },
    showIndigentColumn: true,
    showExport: true,
  }), []);

  return <CategoryResidentsPage config={config} />;
}
