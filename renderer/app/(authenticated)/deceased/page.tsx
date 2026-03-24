'use client';

import { useEffect, useState, useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/skeletons';
import { PageHeader } from '@/components/page-header';
import { usePageSearch } from '@/hooks/use-page-search';
import { getAPI, type Resident, type PaginatedResult } from '@/lib/ipc';
import { cachedFetch } from '@/lib/cache';
import { toast } from 'sonner';

export default function DeceasedPage() {
  const [result, setResult] = useState<PaginatedResult<Resident> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);

  usePageSearch(search, setSearch, 'Search deceased records...');

  const fetchDeceased = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    const data = await cachedFetch(`deceased:${search}:${page}`, () =>
      api.getResidents({ search, page, limit: 50, status: 'deceased' })
    );
    setResult(data);
    setLoaded(true);
  }, [search, page]);

  useEffect(() => { fetchDeceased(); }, [fetchDeceased]);
  useEffect(() => { setPage(1); }, [search]);

  const handleExport = async () => {
    const api = getAPI();
    if (!api) return;
    const result = await api.exportResidents({ status: 'deceased' });
    if (result.success) {
      toast.success(`Exported to ${result.path}`);
    } else {
      toast.error(result.error || 'Export failed');
    }
  };

  const columns: ColumnDef<Resident>[] = [
    { accessorKey: 'last_name', header: 'Last Name' },
    { accessorKey: 'first_name', header: 'First Name' },
    { accessorKey: 'middle_name', header: 'Middle Name', cell: ({ row }) => row.original.middle_name || '-' },
    { accessorKey: 'age', header: 'Age at Record', cell: ({ row }) => row.original.age ?? '-' },
    { accessorKey: 'gender', header: 'Gender' },
    { accessorKey: 'purok', header: 'Purok', cell: ({ row }) => row.original.purok || '-' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Deceased Records" description="Archive of deceased residents — not counted in demographics" />
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {!loaded ? (
        <TableSkeleton />
      ) : (
        <DataTable
          columns={columns}
          data={result?.data || []}
          searchPlaceholder="Search deceased records..."
          searchValue={search}
          onSearchChange={setSearch}
          page={page}
          totalPages={result?.totalPages || 1}
          onPageChange={setPage}
          total={result?.total}
        />
      )}
    </div>
  );
}
