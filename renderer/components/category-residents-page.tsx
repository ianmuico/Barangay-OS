'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { FileText, Printer, Download } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/skeletons';
import { ReportGenerateDialog } from '@/components/report-generate-dialog';
import { ResidentDetailDialog } from '@/components/resident-detail-dialog';
import { CategoryPrintDialog, type GroupOption } from '@/components/category-print-dialog';
import { PageHeader } from '@/components/page-header';
import { usePageSearch } from '@/hooks/use-page-search';
import { getAPI, type Resident, type PaginatedResult, type ReportTemplate } from '@/lib/ipc';
import { toast } from 'sonner';

export interface CategoryConfig {
  title: string;
  description: string;
  searchPlaceholder: string;
  /** Filter params sent to the API */
  filterParams: Record<string, any>;
  /** Extra columns beyond the standard set */
  extraColumns?: ColumnDef<Resident>[];
  /** Show indigent badge column */
  showIndigentColumn?: boolean;
  /** Print dialog config */
  printConfig?: {
    groupOptions: GroupOption[];
    extraColumns?: { key: string; label: string }[];
  };
  /** Show export CSV button instead of / in addition to print */
  showExport?: boolean;
  /** Optional filter applied to report templates in generate dialog */
  reportTemplateFilter?: (t: ReportTemplate) => boolean;
  /** Page key for template visibility tagging (e.g. 'seniors') */
  pageKey?: string;
}

export function CategoryResidentsPage({ config }: { config: CategoryConfig }) {
  const [result, setResult] = useState<PaginatedResult<Resident> | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [reportResident, setReportResident] = useState<Resident | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  usePageSearch(search, setSearch, config.searchPlaceholder);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    const data = await api.getResidents({ search: debouncedSearch, page, limit: 50, ...config.filterParams });
    setResult(data);
    setLoaded(true);
  }, [debouncedSearch, page, config.filterParams]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const filterParams = useMemo(() => config.filterParams, [config.filterParams]);

  const handleExport = async () => {
    const api = getAPI();
    if (!api) return;
    const result = await api.exportResidents(config.filterParams);
    if (result.success) {
      toast.success(`Exported to ${result.path}`);
    } else {
      toast.error(result.error || 'Export failed');
    }
  };

  const columns: ColumnDef<Resident>[] = useMemo(() => {
    const base: ColumnDef<Resident>[] = [
      { accessorKey: 'last_name', header: 'Last Name' },
      { accessorKey: 'first_name', header: 'First Name' },
      { accessorKey: 'age', header: 'Age', cell: ({ row }) => row.original.age ?? '-' },
      { accessorKey: 'gender', header: 'Gender' },
      { accessorKey: 'purok', header: 'Purok', cell: ({ row }) => row.original.purok || '-' },
      { accessorKey: 'contact_number', header: 'Contact', cell: ({ row }) => row.original.contact_number || '-' },
    ];

    if (config.showIndigentColumn) {
      base.push({
        accessorKey: 'is_indigent',
        header: 'Indigent',
        cell: ({ row }) =>
          row.original.is_indigent ? (
            <Badge variant="secondary">Yes</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">No</span>
          ),
      });
    }

    if (config.extraColumns) {
      base.push(...config.extraColumns);
    }

    // Actions column (generate report)
    base.push({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); setReportResident(row.original); }}
          aria-label={`Generate report for ${row.original.first_name} ${row.original.last_name}`}
          title="Generate Report"
        >
          <FileText className="h-4 w-4" />
        </Button>
      ),
    });

    return base;
  }, [config.showIndigentColumn, config.extraColumns]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <PageHeader title={config.title} description={config.description} />
        <div className="flex items-center gap-2">
          {config.showExport && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
          {config.printConfig && (
            <Button variant="outline" onClick={() => setPrintOpen(true)}>
              <Printer className="mr-2 h-4 w-4" />
              Print List
            </Button>
          )}
        </div>
      </div>

      {!loaded ? (
        <TableSkeleton />
      ) : (
        <DataTable
          columns={columns}
          data={result?.data || []}
          searchPlaceholder={config.searchPlaceholder}
          searchValue={search}
          onSearchChange={setSearch}
          page={page}
          totalPages={result?.totalPages || 1}
          onPageChange={setPage}
          total={result?.total}
          onRowClick={(r) => { setDetailId(r.id); setDetailOpen(true); }}
        />
      )}

      {reportResident && (
        <ReportGenerateDialog
          open={!!reportResident}
          onClose={() => setReportResident(null)}
          resident={reportResident}
          templateFilter={config.reportTemplateFilter}
          pageKey={config.pageKey}
        />
      )}

      <ResidentDetailDialog residentId={detailId} open={detailOpen} onOpenChange={setDetailOpen} pageKey={config.pageKey} />

      {config.printConfig && (
        <CategoryPrintDialog
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          title={config.title}
          filterParams={filterParams}
          groupOptions={config.printConfig.groupOptions}
          extraColumns={config.printConfig.extraColumns}
        />
      )}
    </div>
  );
}
