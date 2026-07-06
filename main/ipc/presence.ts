import { ipcMain } from 'electron';
import { getCurrentSessionUser } from './auth';

// ─────────────────────────────────────────────────────────────────────────────
// Live presence ("who's working on what") — advisory, not a hard lock.
//
// Everything (desktop UI + mobile API) funnels through this one process, so a
// single in-memory registry can show the whole barangay who is currently
// adding/editing a given record. Entries expire if their heartbeat stops, so a
// crashed phone or closed window clears itself within ~TTL.
// ─────────────────────────────────────────────────────────────────────────────

export interface PresenceEntry {
  key: string;        // `${entity}:${id}`  (id 'new' for a creation in progress)
  entity: string;     // 'resident' | 'case' | ...
  id: string;
  action: string;     // 'editing' | 'adding' | 'viewing'
  who: string;        // display name (staff name or device name)
  label: string;      // what they're working on, e.g. the resident's name
  sessionId: string;  // unique per editing session, so one actor can be deduped
  since: number;
  lastBeat: number;
}

const TTL_MS = 30_000; // an entry is "live" for 30s after its last heartbeat
const registry = new Map<string, PresenceEntry>(); // keyed by sessionId

function prune(): void {
  const now = Date.now();
  for (const [sid, e] of registry) {
    if (now - e.lastBeat > TTL_MS) registry.delete(sid);
  }
}

// Record/refresh a presence heartbeat. Returns OTHER live actors on the same key.
export function heartbeat(input: {
  entity: string; id: string; action: string; who: string; sessionId: string; label?: string;
}): PresenceEntry[] {
  prune();
  const key = `${input.entity}:${input.id}`;
  const now = Date.now();
  const existing = registry.get(input.sessionId);
  registry.set(input.sessionId, {
    key, entity: input.entity, id: String(input.id), action: input.action,
    who: input.who, label: input.label || existing?.label || '', sessionId: input.sessionId,
    since: existing?.since || now, lastBeat: now,
  });
  return othersOnKey(key, input.sessionId);
}

export function release(sessionId: string): void {
  registry.delete(sessionId);
}

function othersOnKey(key: string, exceptSession: string): PresenceEntry[] {
  prune();
  return [...registry.values()].filter(e => e.key === key && e.sessionId !== exceptSession);
}

export function listAll(): PresenceEntry[] {
  prune();
  return [...registry.values()].sort((a, b) => b.lastBeat - a.lastBeat);
}

export function getForKey(entity: string, id: string): PresenceEntry[] {
  prune();
  const key = `${entity}:${id}`;
  return [...registry.values()].filter(e => e.key === key);
}

export function registerPresenceHandlers(): void {
  ipcMain.handle('presence:heartbeat', async (_event, input: { entity: string; id: string; action: string; sessionId: string; label?: string }) => {
    const user = getCurrentSessionUser();
    const who = user?.full_name || user?.username || 'Office staff';
    return heartbeat({ ...input, who });
  });

  ipcMain.handle('presence:release', async (_event, sessionId: string) => {
    release(sessionId);
    return { success: true };
  });

  ipcMain.handle('presence:list', async () => {
    return listAll();
  });
}
