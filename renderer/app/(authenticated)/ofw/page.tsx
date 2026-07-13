'use client';

import { useMemo } from 'react';
import { CategoryResidentsPage, type CategoryConfig } from '@/components/category-residents-page';
import { SECTORAL_GROUP_OPTIONS } from '@/components/category-print-dialog';

export default function OfwPage() {
  const config: CategoryConfig = useMemo(() => ({
    pageKey: 'ofw',
    title: 'Overseas Filipino Workers (OFW)',
    description: 'Residents registered as OFWs',
    searchPlaceholder: 'Search OFWs...',
    filterParams: { is_ofw: true },
    showIndigentColumn: true,
    showExport: true,
    printConfig: {
      groupOptions: SECTORAL_GROUP_OPTIONS,
    },
  }), []);

  return <CategoryResidentsPage config={config} />;
}
