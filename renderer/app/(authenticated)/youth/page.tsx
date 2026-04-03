'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { YOUTH_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function YouthPage() {
  const config: CategoryConfig = useMemo(() => ({
    title: 'Youth Residents',
    description: 'Ages 15-30, unmarried residents eligible for youth programs',
    searchPlaceholder: 'Search youth residents...',
    filterParams: { is_youth: true },
    printConfig: {
      groupOptions: YOUTH_GROUP_OPTIONS,
      extraColumns: [{ key: 'occupation', label: 'Occupation' }],
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
