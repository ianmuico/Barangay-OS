'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToggleChipProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

// A checkbox that looks like a toggle button: outlined when off, filled with
// the primary color when on, with a check that slides in. Same semantics as a
// checkbox (role/aria included) — just nicer to look at and a bigger target.
export function ToggleChip({ checked, onCheckedChange, disabled, className, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        checked
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <Check className={cn('h-3.5 shrink-0 transition-all duration-150', checked ? 'w-3.5' : 'w-0')} />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

// Full-width list variant — for selectable rows (e.g. template pickers)
export function ToggleRow({ checked, onCheckedChange, disabled, className, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked
          ? 'border-primary bg-primary/10 font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-150',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
