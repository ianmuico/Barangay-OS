'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, FileText, Printer, Upload, Download, FileSpreadsheet } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/skeletons';
import { ResidentForm } from '@/components/resident-form';
import { ReportGenerateDialog } from '@/components/report-generate-dialog';
import { ResidentDetailDialog } from '@/components/resident-detail-dialog';
import { CategoryPrintDialog, ALL_RESIDENTS_GROUP_OPTIONS } from '@/components/category-print-dialog';
import { PageHeader } from '@/components/page-header';
import { usePageSearch } from '@/hooks/use-page-search';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAPI, type Resident, type PaginatedResult } from '@/lib/ipc';
import { invalidateCache } from '@/lib/cache';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { CSVImportDialog } from '@/components/csv-import-dialog';
import { ExcelImportDialog } from '@/components/excel-import-dialog';
import { useTranslation } from 'react-i18next';

export default function ResidentsPage() {
  const { t } = useTranslation();
  const [result, setResult] = useState<PaginatedResult<Resident> | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [formOpen, setFormOpen] = useState(false);
  const [editResident, setEditResident] = useState<Resident | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [reportResident, setReportResident] = useState<Resident | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [printListOpen, setPrintListOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [pendingDup, setPendingDup] = useState<{ data: any; existing: { first_name: string; last_name: string; birth_date: string; purok: string | null } } | null>(null);

  usePageSearch(search, setSearch, 'Search residents...');

  const fetchResidents = useCallback(async () => {
    const api = getAPI();
    if (!api) return;
    const data = await api.getResidents({ search: debouncedSearch, page, limit: 50 });
    setResult(data);
    setLoaded(true);
  }, [debouncedSearch, page]);

  useEffect(() => {
    fetchResidents();
  }, [fetchResidents]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const afterWrite = () => {
    setEditResident(null);
    invalidateCache('residents');
    invalidateCache('dashboard');
    fetchResidents();
  };

  const handleSave = async (data: any) => {
    const api = getAPI();
    if (!api) return;

    if (editResident) {
      // Optimistic concurrency — send the version we loaded
      const result = await api.updateResident(editResident.id, data, editResident.row_version);
      if (result.conflict) {
        toast.error('Someone else changed this resident while you were editing. Reloading the latest — please re-apply your change.');
        setFormOpen(false);
        afterWrite();
        return;
      }
      toast.success('Resident updated');
      afterWrite();
    } else {
      const result = await api.createResident(data);
      if (result.duplicate) {
        // Hold the entry and ask the admin to confirm it's a different person
        setPendingDup({ data, existing: result.duplicate });
        return;
      }
      toast.success('Resident added');
      afterWrite();
    }
  };

  const confirmDuplicateCreate = async () => {
    const api = getAPI();
    if (!api || !pendingDup) return;
    await api.createResident({ ...pendingDup.data, force: true });
    toast.success('Resident added');
    setPendingDup(null);
    setFormOpen(false);
    afterWrite();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const api = getAPI();
    if (!api) return;
    await api.deleteResident(deleteId);
    toast.success('Resident deleted');
    setDeleteId(null);
    invalidateCache('residents');
    invalidateCache('dashboard');
    fetchResidents();
  };

  const columns: ColumnDef<Resident>[] = [
    {
      accessorKey: 'last_name',
      header: 'Last Name',
    },
    {
      accessorKey: 'first_name',
      header: 'First Name',
    },
    {
      accessorKey: 'middle_name',
      header: 'Middle Name',
      cell: ({ row }) => row.original.middle_name || '-',
    },
    {
      accessorKey: 'age',
      header: 'Age',
      cell: ({ row }) => row.original.age ?? '-',
    },
    {
      accessorKey: 'gender',
      header: 'Gender',
    },
    {
      accessorKey: 'purok',
      header: 'Purok',
      cell: ({ row }) => row.original.purok || '-',
    },
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
      id: 'flags',
      header: 'Flags',
      cell: ({ row }) => {
        const cases = row.original.case_count || 0;
        const issues = row.original.open_issues || 0;
        if (!cases && !issues) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="flex gap-1">
            {cases > 0 && (
              <span title={`${cases} case${cases > 1 ? 's' : ''} on record`} className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                ⚖ {cases}
              </span>
            )}
            {issues > 0 && (
              <span title={`${issues} open issue${issues > 1 ? 's' : ''}`} className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                ⚑ {issues}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setReportResident(row.original)}
            title="Generate Report"
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEditResident(row.original);
              setFormOpen(true);
            }}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteId(row.original.id)}
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Residents" description="Manage resident records and generate reports" />

      {!loaded ? (
        <TableSkeleton />
      ) : result && result.total === 0 && !search ? (
        <EmptyState
          illustration="residents"
          title={t('empty.residentsTitle')}
          message={t('empty.residentsMessage')}
          primaryAction={{
            label: t('empty.residentsCta'),
            onClick: () => { setEditResident(null); setFormOpen(true); },
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={result?.data || []}
          searchPlaceholder="Search residents..."
          searchValue={search}
          onSearchChange={setSearch}
          page={page}
          totalPages={result?.totalPages || 1}
          onPageChange={setPage}
          total={result?.total}
          onRowClick={(r) => { setDetailId(r.id); setDetailOpen(true); }}
          toolbar={
            <div className="flex gap-2">
              <Button variant="outline" onClick={async () => {
                const api = getAPI();
                if (!api) return;
                const r = await api.downloadExcelTemplate(true);
                if (r.success) toast.success(`Template saved to ${r.path}`);
                else if (r.error !== 'Save cancelled') toast.error(r.error || 'Failed to build template');
              }}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Excel Template
              </Button>
              <Button variant="outline" onClick={() => setExcelImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import Excel
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
              <Button variant="outline" onClick={async () => {
                const api = getAPI();
                if (!api) return;
                const result = await api.exportResidents({});
                if (result.success) toast.success(`Exported to ${result.path}`);
                else toast.error(result.error || 'Export failed');
              }}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button variant="outline" onClick={() => setPrintListOpen(true)}>
                <Printer className="mr-2 h-4 w-4" />
                Print List
              </Button>
              <Button onClick={() => { setEditResident(null); setFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Resident
              </Button>
            </div>
          }
        />
      )}

      <ResidentForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditResident(null); }}
        onSave={handleSave}
        resident={editResident}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resident</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this resident? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {reportResident && (
        <ReportGenerateDialog
          open={!!reportResident}
          onClose={() => setReportResident(null)}
          resident={reportResident}
          pageKey="residents"
        />
      )}

      <AlertDialog open={pendingDup !== null} onOpenChange={(o) => { if (!o) setPendingDup(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Possible Duplicate</AlertDialogTitle>
            <AlertDialogDescription>
              A resident with the same name and birth date already exists:
              {pendingDup && (
                <span className="mt-2 block rounded-md border bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {pendingDup.existing.first_name} {pendingDup.existing.last_name}
                  {' · '}{pendingDup.existing.birth_date}
                  {pendingDup.existing.purok ? ` · Purok ${pendingDup.existing.purok}` : ''}
                </span>
              )}
              <span className="mt-2 block">Add this as a separate new record anyway? Only do this if they are genuinely different people.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDuplicateCreate}>Add as new record</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResidentDetailDialog residentId={detailId} open={detailOpen} onOpenChange={setDetailOpen} />

      <CategoryPrintDialog
        open={printListOpen}
        onClose={() => setPrintListOpen(false)}
        title="All Residents"
        filterParams={{}}
        groupOptions={ALL_RESIDENTS_GROUP_OPTIONS}
      />

      <ExcelImportDialog
        open={excelImportOpen}
        onClose={() => setExcelImportOpen(false)}
        onImportComplete={() => {
          invalidateCache('residents');
          invalidateCache('dashboard');
          fetchResidents();
        }}
      />

      <CSVImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImportComplete={() => {
          invalidateCache('residents');
          invalidateCache('dashboard');
          fetchResidents();
        }}
      />
    </div>
  );
}
