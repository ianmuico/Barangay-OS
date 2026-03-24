'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { FileText, Printer, Download } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/skeletons';
import { ReportGenerateDialog } from '@/components/report-generate-dialog';
import { PageHeader } from '@/components/page-header';
import { usePageSearch } from '@/hooks/use-page-search';
import { getAPI, type Resident, type PaginatedResult } from '@/lib/ipc';
import { toast } from 'sonner';

export default function FourPsPage() {
  const [result, setResult] = useState<PaginatedResult<Resident> | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [reportResident, setReportResident] = useState<Resident | null>(null);

  usePageSearch(search, setSearch, 'Search 4Ps beneficiaries...');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetch4Ps = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    const data = await api.getResidents({ search: debouncedSearch, page, limit: 50, is_4ps: true });
    setResult(data);
    setLoaded(true);
  }, [debouncedSearch, page]);

  useEffect(() => { fetch4Ps(); }, [fetch4Ps]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const handleExport = async () => {
    const api = getAPI();
    if (!api) return;
    const result = await api.exportResidents({ is_4ps: true });
    if (result.success) {
      toast.success(`Exported to ${result.path}`);
    } else {
      toast.error(result.error || 'Export failed');
    }
  };

  const columns: ColumnDef<Resident>[] = [
    { accessorKey: 'last_name', header: 'Last Name' },
    { accessorKey: 'first_name', header: 'First Name' },
    { accessorKey: 'age', header: 'Age', cell: ({ row }) => row.original.age ?? '-' },
    { accessorKey: 'gender', header: 'Gender' },
    { accessorKey: 'purok', header: 'Purok', cell: ({ row }) => row.original.purok || '-' },
    { accessorKey: 'contact_number', header: 'Contact', cell: ({ row }) => row.original.contact_number || '-' },
    {
      accessorKey: 'is_indigent',
      header: 'Indigent',
      cell: ({ row }) =>
        row.original.is_indigent ? (
          <Badge variant="secondary">Yes</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">No</span>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={() => setReportResident(row.original)} title="Generate Report">
          <FileText className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="4Ps Beneficiaries" description="Pantawid Pamilyang Pilipino Program beneficiaries" />
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
          searchPlaceholder="Search 4Ps beneficiaries..."
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
    </div>
  );
}
