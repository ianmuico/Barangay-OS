'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { PaperSettings } from '@/lib/ipc';
import { PAPER_SIZES } from '@/lib/paper';

interface PaperSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paper: PaperSettings;
  onChange: (paper: PaperSettings) => void;
}

export function PaperSetupDialog({ open, onOpenChange, paper, onChange }: PaperSetupDialogProps) {
  const [draft, setDraft] = useState<PaperSettings>(paper);

  useEffect(() => {
    if (open) setDraft(paper);
  }, [open, paper]);

  const setMargin = (side: keyof PaperSettings['margins'], value: string) => {
    const n = parseFloat(value);
    setDraft(d => ({
      ...d,
      margins: { ...d.margins, [side]: isNaN(n) ? 0 : Math.min(3, Math.max(0, n)) },
    }));
  };

  const apply = () => {
    onChange(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Page Setup</DialogTitle>
          <DialogDescription>Paper size, orientation and margins for this template — used on screen and when printing.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Paper Size</Label>
            <Select value={draft.size} onValueChange={(v) => setDraft(d => ({ ...d, size: v as PaperSettings['size'] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAPER_SIZES).map(([key, s]) => (
                  <SelectItem key={key} value={key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Orientation</Label>
            <Select value={draft.orientation} onValueChange={(v) => setDraft(d => ({ ...d, orientation: v as PaperSettings['orientation'] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Margins (inches)</Label>
            <div className="grid grid-cols-2 gap-3">
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                <div key={side} className="flex items-center gap-2">
                  <span className="w-14 text-xs capitalize text-muted-foreground">{side}</span>
                  <Input
                    type="number"
                    min={0}
                    max={3}
                    step={0.25}
                    value={draft.margins[side]}
                    onChange={(e) => setMargin(side, e.target.value)}
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
