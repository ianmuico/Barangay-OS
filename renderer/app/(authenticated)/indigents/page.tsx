'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { INDIGENT_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function IndigentsPage() {
  const config: CategoryConfig = useMemo(() => ({
    title: 'Indigent Residents',
    description: 'Residents flagged as indigent for assistance programs',
    searchPlaceholder: 'Search indigent residents...',
    filterParams: { is_indigent: true },
    printConfig: {
      groupOptions: INDIGENT_GROUP_OPTIONS,
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
