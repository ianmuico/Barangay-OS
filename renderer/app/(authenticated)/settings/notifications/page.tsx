'use client';

import { useEffect, useState } from 'react';
import { BellRing, Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

const DEFAULT_REMINDER_LEADS = [1440, 60]; // 1 day and 1 hour before

const PRESETS = [
  { minutes: 10080, label: '1 week before' },
  { minutes: 4320, label: '3 days before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 60, label: '1 hour before' },
];

function leadLabel(minutes: number): string {
  const preset = PRESETS.find(p => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes / 1440 > 1 ? 's' : ''} before`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes / 60 > 1 ? 's' : ''} before`;
  return `${minutes} minutes before`;
}

export default function NotificationsSettingsPage() {
  const [enabled, setEnabled] = useState(true);
  const [leads, setLeads] = useState<number[]>(DEFAULT_REMINDER_LEADS);
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getSetting('reminder_enabled').then(v => setEnabled(v !== '0'));
    api.getSetting('reminder_leads').then(v => {
      if (!v) return;
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number')) setLeads(parsed);
      } catch { /* keep defaults */ }
    });
  }, []);

  const save = async (nextEnabled: boolean, nextLeads: number[]) => {
    const api = getAPI();
    if (!api) return;
    setSaving(true);
    try {
      await api.setSetting('reminder_enabled', nextEnabled ? '1' : '0');
      await api.setSetting('reminder_leads', JSON.stringify(nextLeads.sort((a, b) => b - a)));
      toast.success('Reminder settings saved');
    } finally {
      setSaving(false);
    }
  };

  const togglePreset = (minutes: number, checked: boolean) => {
    const next = checked ? [...leads, minutes] : leads.filter(l => l !== minutes);
    setLeads(next);
    save(enabled, next);
  };

  const addCustom = () => {
    const n = parseInt(customValue, 10);
    if (!n || n <= 0) return;
    const minutes = customUnit === 'days' ? n * 1440 : customUnit === 'hours' ? n * 60 : n;
    if (leads.includes(minutes)) { toast.info('That reminder already exists'); return; }
    const next = [...leads, minutes];
    setLeads(next);
    setCustomValue('');
    save(enabled, next);
  };

  const removeLead = (minutes: number) => {
    const next = leads.filter(l => l !== minutes);
    setLeads(next);
    save(enabled, next);
  };

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    save(checked, leads);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Reminders for upcoming summons hearings and case schedules." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4" />
            Hearing Reminders
          </CardTitle>
          <CardDescription>
            A pop-up reminder appears inside the app when a scheduled summon hearing is coming up.
            Choose how far in advance you want to be reminded — each option fires once per hearing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Enable reminders</p>
              <p className="text-xs text-muted-foreground">Checks every few minutes while the app is open</p>
            </div>
            <Switch checked={enabled} onCheckedChange={handleToggle} disabled={saving} />
          </div>

          <div className="space-y-2">
            <Label>Remind me</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <ToggleChip
                  key={p.minutes}
                  checked={leads.includes(p.minutes)}
                  onCheckedChange={(checked) => togglePreset(p.minutes, checked)}
                  disabled={!enabled || saving}
                >
                  {p.label}
                </ToggleChip>
              ))}
            </div>
          </div>

          {/* Custom leads */}
          <div className="space-y-2">
            <Label>Custom reminder</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={1} value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
                className="h-8 w-24" placeholder="e.g. 2"
                disabled={!enabled || saving}
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as any)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
                disabled={!enabled || saving}
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
              <span className="text-sm text-muted-foreground">before the hearing</span>
              <Button size="sm" className="h-8" onClick={addCustom} disabled={!enabled || saving}>
                <Plus className="mr-1 h-3.5 w-3.5" />Add
              </Button>
            </div>
            {/* Custom (non-preset) leads shown as removable chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {leads.filter(l => !PRESETS.some(p => p.minutes === l)).map((l) => (
                <span key={l} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs">
                  {leadLabel(l)}
                  <button type="button" onClick={() => removeLead(l)} className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/20">
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
