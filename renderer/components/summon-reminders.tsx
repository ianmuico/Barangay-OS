'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // re-check every 5 minutes
const DEFAULT_LEADS = [1440, 60];
// Storage nudge: suggest cleaning up old generated documents when they pile up
const STORAGE_WARN_BYTES = 150 * 1048576; // 150 MB
const STORAGE_WARN_COUNT = 5000;
const STORAGE_NAG_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // at most once a week

function eventTime(summonDate: string, summonTime: string | null): Date {
  // Hearings without a time are treated as 8:00 AM
  return new Date(`${summonDate}T${summonTime || '08:00'}:00`);
}

function humanUntil(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

// Invisible watcher mounted in the authenticated layout: pops a toast when a
// scheduled summon hearing enters one of the configured reminder windows.
// Each (hearing, lead) pair only ever fires once (tracked in localStorage).
export function SummonReminders() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const api = getAPI();
      if (!api || cancelled) return;
      try {
        const enabled = (await api.getSetting('reminder_enabled')) !== '0';
        if (!enabled) return;

        let leads = DEFAULT_LEADS;
        const rawLeads = await api.getSetting('reminder_leads');
        if (rawLeads) {
          try {
            const parsed = JSON.parse(rawLeads);
            if (Array.isArray(parsed) && parsed.length) leads = parsed;
          } catch { /* keep defaults */ }
        }

        const summons = await api.getUpcomingSummons(100);
        const now = Date.now();

        for (const s of summons) {
          if (s.status !== 'scheduled') continue;
          const event = eventTime(s.summon_date, s.summon_time).getTime();
          if (isNaN(event) || event <= now) continue;

          for (const leadMinutes of leads) {
            const windowStart = event - leadMinutes * 60000;
            if (now < windowStart) continue;
            const key = `summon-reminder-${s.id}-${leadMinutes}`;
            if (localStorage.getItem(key)) continue;
            localStorage.setItem(key, '1');

            toast.info(
              `Hearing ${humanUntil(event - now)} — Case ${s.case_number || ''}`,
              {
                description: `${s.summoned_name || 'Resident'} · ${new Date(event).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' })}${s.summon_time ? ` at ${s.summon_time}` : ''}`,
                duration: 12000,
                action: { label: 'View', onClick: () => router.push('/cases') },
              },
            );
          }
        }
      } catch { /* offline DB hiccup — try again next interval */ }
    };

    const checkStorage = async () => {
      const api = getAPI();
      if (!api || cancelled) return;
      try {
        const last = Number(localStorage.getItem('storage-nag-at') || 0);
        if (Date.now() - last < STORAGE_NAG_COOLDOWN_MS) return;
        const stats = await api.getReportStorageStats();
        if (stats.totalBytes > STORAGE_WARN_BYTES || stats.count > STORAGE_WARN_COUNT) {
          localStorage.setItem('storage-nag-at', String(Date.now()));
          toast.warning('Saved documents are taking up a lot of space', {
            description: `${stats.count.toLocaleString()} documents (${(stats.totalBytes / 1048576).toFixed(0)} MB). Old document copies can be cleaned up — records are never affected.`,
            duration: 15000,
            action: { label: 'Review', onClick: () => router.push('/settings/backup') },
          });
        }
      } catch { /* ignore */ }
    };

    check();
    checkStorage();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [router]);

  return null;
}
