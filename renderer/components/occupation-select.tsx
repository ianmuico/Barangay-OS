'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, ChevronDown, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getAPI } from '@/lib/ipc';

// Predefined occupations organized by category
const STUDYING_OCCUPATIONS = [
  'Student',
  'College Student',
  'High School Student',
  'Elementary Student',
  'Vocational Student',
  'Scholar',
];

const WORKING_OCCUPATIONS = [
  'Farmer',
  'Fisher',
  'Vendor',
  'Tricycle Driver',
  'Construction Worker',
  'Teacher',
  'Government Employee',
  'OFW',
  'Store Owner',
  'Carpenter',
  'Electrician',
  'Mechanic',
  'Nurse',
  'Midwife',
  'Barangay Health Worker',
  'Driver',
  'Laborer',
  'Domestic Helper',
  'Freelancer',
  'Self-Employed',
  'Business Owner',
  'Office Worker',
  'Security Guard',
  'Seaman',
  'Welder',
  'Plumber',
  'Tailor',
  'Cook',
  'Caregiver',
];

const DEFAULT_OCCUPATIONS = [
  ...STUDYING_OCCUPATIONS.map(o => ({ label: o, category: 'Studying' as const })),
  ...WORKING_OCCUPATIONS.map(o => ({ label: o, category: 'Working' as const })),
];

interface OccupationSelectProps {
  value: string; // comma-separated string
  onChange: (value: string) => void;
}

export function OccupationSelect({ value, onChange }: OccupationSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customOccupations, setCustomOccupations] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse current value into array of occupations
  const selected = useMemo(() => {
    if (!value || !value.trim()) return [] as string[];
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }, [value]);

  // Load custom occupations from existing residents on mount
  useEffect(() => {
    const api = getAPI();
    if (!api) return;

    api.getResidents({ page: 1, limit: 10000 }).then(result => {
      const allOccs = new Set<string>();
      const defaultLabels = new Set(DEFAULT_OCCUPATIONS.map(o => o.label.toLowerCase()));

      for (const r of result.data) {
        if (r.occupation) {
          const parts = r.occupation.split(',').map((s: string) => s.trim()).filter(Boolean);
          for (const p of parts) {
            if (!defaultLabels.has(p.toLowerCase())) {
              allOccs.add(p);
            }
          }
        }
      }
      setCustomOccupations(Array.from(allOccs).sort());
    });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allOptions = useMemo(() => {
    const options = [...DEFAULT_OCCUPATIONS];
    for (const custom of customOccupations) {
      if (!DEFAULT_OCCUPATIONS.some(o => o.label.toLowerCase() === custom.toLowerCase())) {
        options.push({ label: custom, category: 'Working' });
      }
    }
    return options;
  }, [customOccupations]);

  // Filter options based on search, exclude already selected
  const filteredOptions = useMemo(() => {
    const selectedLower = new Set(selected.map(s => s.toLowerCase()));
    let filtered = allOptions.filter(o => !selectedLower.has(o.label.toLowerCase()));

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(o => o.label.toLowerCase().includes(q));
    }

    return filtered;
  }, [allOptions, selected, search]);

  // Check if search matches any existing option
  const canAddCustom = useMemo(() => {
    if (!search.trim()) return false;
    const q = search.trim().toLowerCase();
    return !allOptions.some(o => o.label.toLowerCase() === q)
      && !selected.some(s => s.toLowerCase() === q);
  }, [search, allOptions, selected]);

  const addOccupation = (label: string) => {
    const newSelected = [...selected, label];
    onChange(newSelected.join(', '));
    setSearch('');
    inputRef.current?.focus();
  };

  const removeOccupation = (label: string) => {
    const newSelected = selected.filter(s => s !== label);
    onChange(newSelected.join(', '));
  };

  const addCustom = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    // Capitalize first letter of each word
    const formatted = trimmed.replace(/\b\w/g, c => c.toUpperCase());
    addOccupation(formatted);
    if (!customOccupations.includes(formatted)) {
      setCustomOccupations(prev => [...prev, formatted].sort());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canAddCustom) {
        addCustom();
      } else if (filteredOptions.length === 1) {
        addOccupation(filteredOptions[0].label);
      }
    } else if (e.key === 'Backspace' && !search && selected.length > 0) {
      removeOccupation(selected[selected.length - 1]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  };

  // Group filtered options by category
  const groupedOptions = useMemo(() => {
    const studying = filteredOptions.filter(o => o.category === 'Studying');
    const working = filteredOptions.filter(o => o.category === 'Working');
    return { studying, working };
  }, [filteredOptions]);

  return (
    <div ref={containerRef} className="relative">
      {/* Selected pills + search input */}
      <div
        className="flex flex-wrap items-center gap-1 min-h-[36px] w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text"
        onClick={() => { setIsOpen(true); inputRef.current?.focus(); }}
      >
        {selected.map(occ => (
          <Badge
            key={occ}
            variant="secondary"
            className="font-normal text-xs pl-2 pr-1 py-0.5 gap-1 shrink-0"
          >
            {occ}
            <button
              type="button"
              className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
              onClick={(e) => { e.stopPropagation(); removeOccupation(occ); }}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? 'Select or type occupation...' : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground h-7"
        />
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="max-h-52 overflow-y-auto p-1">
            {/* Add custom option */}
            {canAddCustom && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors text-primary"
                onClick={addCustom}
              >
                <Plus className="h-3.5 w-3.5" />
                Add &ldquo;{search.trim()}&rdquo;
              </button>
            )}

            {/* Studying category */}
            {groupedOptions.studying.length > 0 && (
              <>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  📚 Studying
                </div>
                {groupedOptions.studying.map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                    onClick={() => addOccupation(opt.label)}
                  >
                    {opt.label}
                  </button>
                ))}
              </>
            )}

            {/* Working category */}
            {groupedOptions.working.length > 0 && (
              <>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                  💼 Working
                </div>
                {groupedOptions.working.map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                    onClick={() => addOccupation(opt.label)}
                  >
                    {opt.label}
                  </button>
                ))}
              </>
            )}

            {/* Empty state */}
            {filteredOptions.length === 0 && !canAddCustom && (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                {search ? 'No matching occupations' : 'All occupations selected'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: determine youth category from occupation string
export function getYouthCategory(occupation: string | null): 'Studying' | 'Working' | 'Unspecified' {
  if (!occupation || !occupation.trim()) return 'Unspecified';

  const parts = occupation.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0 || parts.every(p => p === 'n/a' || p === 'none' || p === '-')) {
    return 'Unspecified';
  }

  const studyKeywords = ['student', 'study', 'school', 'college', 'university', 'scholar', 'vocational student'];
  const hasStudying = parts.some(p => studyKeywords.some(k => p.includes(k)));

  if (hasStudying) return 'Studying';
  return 'Working';
}
