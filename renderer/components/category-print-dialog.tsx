'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getAPI, type Resident } from '@/lib/ipc';
import { toast } from 'sonner';
import { getYouthCategory } from '@/components/occupation-select';

// ─── Types ───
export interface GroupOption {
  value: string;
  label: string;
  /** Function to extract group key from resident */
  groupBy: (r: Resident) => string;
  /** Sort groups alphabetically? */
  sortGroups?: boolean;
}

interface CategoryPrintDialogProps {
  open: boolean;
  onClose: () => void;
  /** Title for the PDF, e.g. "Senior Citizens" */
  title: string;
  /** Filter params passed to getResidents */
  filterParams: Record<string, any>;
  /** Available grouping options */
  groupOptions: GroupOption[];
  /** Extra columns specific to this category */
  extraColumns?: { key: string; label: string }[];
}

interface ListHeader {
  id: string;
  name: string;
  content_html: string;
}

const BASE_COLUMNS = [
  { key: 'last_name', label: 'Last Name' },
  { key: 'first_name', label: 'First Name' },
  { key: 'middle_name', label: 'Middle Name' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'purok', label: 'Purok' },
  { key: 'civil_status', label: 'Civil Status' },
];

export function CategoryPrintDialog({
  open,
  onClose,
  title,
  filterParams,
  groupOptions,
  extraColumns,
}: CategoryPrintDialogProps) {
  const [groupBy, setGroupBy] = useState(groupOptions[0]?.value || 'alphabetical');
  const [listHeaders, setListHeaders] = useState<ListHeader[]>([]);
  const [selectedHeaderId, setSelectedHeaderId] = useState<string>('default');
  const [activeMode, setActiveMode] = useState<'download' | 'print' | null>(null);
  const [count, setCount] = useState<number | null>(null);

  // Load list headers and get count
  useEffect(() => {
    if (!open) return;
    const api = getAPI();
    if (!api) return;

    api.getSetting('list_header_templates').then(raw => {
      if (raw) {
        try { setListHeaders(JSON.parse(raw)); } catch { setListHeaders([]); }
      }
    });

    // Get resident count for this category
    api.getResidents({ ...filterParams, page: 1, limit: 1 }).then(result => {
      setCount(result.total);
    });
  }, [open, filterParams]);

  const handleExport = async (mode: 'download' | 'print') => {
    const api = getAPI();
    if (!api) return;
    setActiveMode(mode);

    try {
      // Fetch all residents for this category
      const result = await api.getResidents({
        ...filterParams,
        page: 1,
        limit: 10000,
        sortBy: 'last_name',
        sortOrder: 'asc' as const,
      });

      if (!result.data || result.data.length === 0) {
        toast.error('No residents found');
        return;
      }

      const columns = extraColumns
        ? [...BASE_COLUMNS, ...extraColumns]
        : BASE_COLUMNS;

      // Find the selected group option
      const selectedGroup = groupOptions.find(g => g.value === groupBy);
      if (!selectedGroup) return;

      // Group the residents
      const groups = new Map<string, Resident[]>();
      for (const r of result.data) {
        const key = selectedGroup.groupBy(r);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      }

      // Sort group keys
      let sortedKeys = Array.from(groups.keys());
      if (selectedGroup.sortGroups !== false) {
        sortedKeys.sort((a, b) => a.localeCompare(b));
      }

      // Build grouped data
      const groupedData = sortedKeys.map(key => ({
        groupLabel: key,
        rows: groups.get(key)!.map(r => ({
          last_name: r.last_name || '',
          first_name: r.first_name || '',
          middle_name: r.middle_name || '-',
          age: (r as any).age ?? '-',
          gender: r.gender || '-',
          purok: r.purok || '-',
          civil_status: r.civil_status || '-',
          contact_number: r.contact_number || '-',
          occupation: r.occupation || '-',
          is_indigent: r.is_indigent ? 'Yes' : 'No',
        })),
      }));

      // Get header HTML
      let headerHtml = '';
      if (selectedHeaderId !== 'default') {
        const header = listHeaders.find(h => h.id === selectedHeaderId);
        if (header) headerHtml = header.content_html;
      }

      const printResult = await api.printGroupedList({
        headerHtml,
        groups: groupedData,
        columns,
        title,
        groupByLabel: selectedGroup.label,
        mode,
      });

      if (printResult.success) {
        toast.success(mode === 'print'
          ? `Sent to printer — ${result.data.length} records in ${sortedKeys.length} groups`
          : `PDF saved — ${result.data.length} records in ${sortedKeys.length} groups`
        );
        onClose();
      } else {
        if (printResult.error !== 'Save cancelled') {
          toast.error(printResult.error || 'Failed to export');
        }
      }
    } finally {
      setActiveMode(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print {title}</DialogTitle>
          <DialogDescription>
            Export a grouped PDF list. Each group starts on a fresh page with its own header.
            {count !== null && (
              <span className="block mt-1 font-medium text-foreground">{count} total records found</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Group By</Label>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {groupOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Each group will be printed on a separate page with its own header and row numbering.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Page Header</Label>
            <Select value={selectedHeaderId} onValueChange={setSelectedHeaderId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (Barangay Info)</SelectItem>
                {listHeaders.map(h => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Create custom headers in Templates → List Headers tab.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => handleExport('download')} disabled={activeMode !== null || count === 0}>
            {activeMode === 'download' ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
            ) : (
              <><Download className="mr-2 h-4 w-4" />Save PDF</>
            )}
          </Button>
          <Button onClick={() => handleExport('print')} disabled={activeMode !== null || count === 0}>
            {activeMode === 'print' ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Printing...</>
            ) : (
              <><Printer className="mr-2 h-4 w-4" />Print</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pre-built group options for each category ───

export const SENIOR_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'alphabetical',
    label: 'Alphabetical (A-Z)',
    groupBy: (r) => (r.last_name?.[0] || '#').toUpperCase(),
  },
  {
    value: 'gender',
    label: 'By Gender',
    groupBy: (r) => r.gender || 'Unspecified',
  },
  {
    value: 'purok',
    label: 'By Purok',
    groupBy: (r) => r.purok || 'No Purok Assigned',
  },
  {
    value: 'age_bracket',
    label: 'By Age Bracket',
    groupBy: (r) => {
      const age = (r as any).age ?? 0;
      if (age >= 80) return '80 and above';
      if (age >= 70) return '70-79';
      if (age >= 60) return '60-69';
      return 'Below 60';
    },
  },
  {
    value: 'indigent_status',
    label: 'By Indigent Status',
    groupBy: (r) => r.is_indigent ? 'Indigent' : 'Non-Indigent',
  },
];

export const INDIGENT_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'alphabetical',
    label: 'Alphabetical (A-Z)',
    groupBy: (r) => (r.last_name?.[0] || '#').toUpperCase(),
  },
  {
    value: 'purok',
    label: 'By Purok',
    groupBy: (r) => r.purok || 'No Purok Assigned',
  },
  {
    value: 'gender',
    label: 'By Gender',
    groupBy: (r) => r.gender || 'Unspecified',
  },
  {
    value: 'age_bracket',
    label: 'By Age Bracket',
    groupBy: (r) => {
      const age = (r as any).age ?? 0;
      if (age >= 60) return 'Senior (60+)';
      if (age >= 30) return 'Adult (30-59)';
      if (age >= 15) return 'Youth (15-29)';
      return 'Below 15';
    },
  },
  {
    value: 'civil_status',
    label: 'By Civil Status',
    groupBy: (r) => r.civil_status || 'Unspecified',
  },
];

export const YOUTH_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'alphabetical',
    label: 'Alphabetical (A-Z)',
    groupBy: (r) => (r.last_name?.[0] || '#').toUpperCase(),
  },
  {
    value: 'occupation',
    label: 'By Status (Studying/Working/Unspecified)',
    groupBy: (r) => getYouthCategory(r.occupation),
  },
  {
    value: 'purok',
    label: 'By Purok',
    groupBy: (r) => r.purok || 'No Purok Assigned',
  },
  {
    value: 'gender',
    label: 'By Gender',
    groupBy: (r) => r.gender || 'Unspecified',
  },
  {
    value: 'age_bracket',
    label: 'By Age Bracket',
    groupBy: (r) => {
      const age = (r as any).age ?? 0;
      if (age >= 25) return '25-30';
      if (age >= 20) return '20-24';
      if (age >= 15) return '15-19';
      return 'Below 15';
    },
  },
];
