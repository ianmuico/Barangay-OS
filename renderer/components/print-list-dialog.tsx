'use client';

import { useEffect, useState } from 'react';
import { Download, Printer, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

type SortOption = 'last_name' | 'purok' | 'age';
type FilterOption = 'all' | 'senior' | 'indigent' | 'youth' | 'male' | 'female';

interface ListHeader {
  id: string;
  name: string;
  content_html: string;
}

const FILTER_LABELS: Record<FilterOption, string> = {
  all: 'All Residents',
  senior: 'Senior Citizens (60+)',
  indigent: 'Indigents',
  youth: 'Youth (15-30, Unmarried)',
  male: 'Male Only',
  female: 'Female Only',
};

const SORT_LABELS: Record<SortOption, string> = {
  last_name: 'Alphabetical (Last Name)',
  purok: 'By Purok',
  age: 'By Age',
};

const LIST_COLUMNS = [
  { key: 'last_name', label: 'Last Name' },
  { key: 'first_name', label: 'First Name' },
  { key: 'middle_name', label: 'Middle Name' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'purok', label: 'Purok' },
  { key: 'civil_status', label: 'Civil Status' },
];

interface PrintListDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PrintListDialog({ open, onClose }: PrintListDialogProps) {
  const [filter, setFilter] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('last_name');
  const [listHeaders, setListHeaders] = useState<ListHeader[]>([]);
  const [selectedHeaderId, setSelectedHeaderId] = useState<string>('default');
  const [activeMode, setActiveMode] = useState<'download' | 'print' | null>(null);

  useEffect(() => {
    if (open) {
      const api = getAPI();
      if (!api) return;
      api.getSetting('list_header_templates').then(raw => {
        if (raw) {
          try { setListHeaders(JSON.parse(raw)); } catch { setListHeaders([]); }
        }
      });
    }
  }, [open]);

  const handleExport = async (mode: 'download' | 'print') => {
    const api = getAPI();
    if (!api) return;
    setActiveMode(mode);
    try {
      const params: any = { page: 1, limit: 10000, sortBy, sortOrder: 'asc' as const };
      if (filter === 'senior') params.is_senior = true;
      if (filter === 'indigent') params.is_indigent = true;
      if (filter === 'youth') params.is_youth = true;
      if (filter === 'male') params.gender = 'Male';
      if (filter === 'female') params.gender = 'Female';

      const result = await api.getResidents(params);
      if (!result.data || result.data.length === 0) {
        toast.error('No residents found for the selected filter');
        return;
      }

      const title = FILTER_LABELS[filter];
      const rows = result.data.map((r: any) => ({
        last_name: r.last_name || '',
        first_name: r.first_name || '',
        middle_name: r.middle_name || '-',
        age: r.age ?? '-',
        gender: r.gender || '-',
        purok: r.purok || '-',
        civil_status: r.civil_status || '-',
      }));

      // Get header HTML from selected template
      let headerHtml = '';
      if (selectedHeaderId !== 'default') {
        const header = listHeaders.find(h => h.id === selectedHeaderId);
        if (header) headerHtml = header.content_html;
      }

      const printResult = await api.printList({ headerHtml, rows, columns: LIST_COLUMNS, title, mode });
      if (printResult.success) {
        toast.success(mode === 'print'
          ? `Sent to printer — ${rows.length} records`
          : `PDF saved with ${rows.length} records`
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
          <DialogTitle>Print Resident List</DialogTitle>
          <DialogDescription>Export a formatted A4 PDF list with page numbers.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FILTER_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sort By</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button variant="outline" onClick={() => handleExport('download')} disabled={activeMode !== null}>
            {activeMode === 'download' ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
            ) : (
              <><Download className="mr-2 h-4 w-4" />Save PDF</>
            )}
          </Button>
          <Button onClick={() => handleExport('print')} disabled={activeMode !== null}>
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
