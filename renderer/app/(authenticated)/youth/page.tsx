'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { FileText, Printer } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/skeletons';
import { ReportGenerateDialog } from '@/components/report-generate-dialog';
import { CategoryPrintDialog, YOUTH_GROUP_OPTIONS } from '@/components/category-print-dialog';
import { PageHeader } from '@/components/page-header';
import { usePageSearch } from '@/hooks/use-page-search';
import { getAPI, type Resident, type PaginatedResult } from '@/lib/ipc';

export default function YouthPage() {
  const [result, setResult] = useState<PaginatedResult<Resident> | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [reportResident, setReportResident] = useState<Resident | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  usePageSearch(search, setSearch, 'Search youth residents...');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchYouth = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    const data = await api.getResidents({ search: debouncedSearch, page, limit: 50, is_youth: true });
    setResult(data);
    setLoaded(true);
  }, [debouncedSearch, page]);

  useEffect(() => {
    fetchYouth();
  }, [fetchYouth]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const filterParams = useMemo(() => ({ is_youth: true }), []);

  const columns: ColumnDef<Resident>[] = [
    { accessorKey: 'last_name', header: 'Last Name' },
    { accessorKey: 'first_name', header: 'First Name' },
    {
      accessorKey: 'age',
      header: 'Age',
      cell: ({ row }) => row.original.age ?? '-',
    },
    { accessorKey: 'gender', header: 'Gender' },
    {
      accessorKey: 'purok',
      header: 'Purok',
      cell: ({ row }) => row.original.purok || '-',
    },
    {
      accessorKey: 'contact_number',
      header: 'Contact',
      cell: ({ row }) => row.original.contact_number || '-',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setReportResident(row.original)}
          title="Generate Report"
        >
          <FileText className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Youth Residents" description="Ages 15-30, unmarried residents eligible for youth programs" />
        <Button variant="outline" onClick={() => setPrintOpen(true)}>
          <Printer className="mr-2 h-4 w-4" />
          Print List
        </Button>
      </div>

      {!loaded ? (
        <TableSkeleton />
      ) : (
        <DataTable
          columns={columns}
          data={result?.data || []}
          searchPlaceholder="Search youth residents..."
          searchValue={search}
          onSearchChange={setSearch}
          page={page}
          totalPages={result?.totalPages || 1}
          onPageChange={setPage}
          total={result?.total}
        />
      )}

      {reportResident && (
        <ReportGenerateDialog
          open={!!reportResident}
          onClose={() => setReportResident(null)}
          resident={reportResident}
        />
      )}

      <CategoryPrintDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Youth Residents"
        filterParams={filterParams}
        groupOptions={YOUTH_GROUP_OPTIONS}
        extraColumns={[{ key: 'occupation', label: 'Occupation' }]}
      />
    </div>
  );
}
