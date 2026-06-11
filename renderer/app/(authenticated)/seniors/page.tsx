'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { SENIOR_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function SeniorsPage() {
  const config: CategoryConfig = useMemo(() => ({
    pageKey: 'seniors',
    title: 'Senior Citizens',
    description: 'Residents aged 60 and above',
    searchPlaceholder: 'Search senior citizens...',
    filterParams: { is_senior: true },
    showIndigentColumn: true,
    printConfig: {
      groupOptions: SENIOR_GROUP_OPTIONS,
      extraColumns: [{ key: 'is_indigent', label: 'Indigent' }],
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
