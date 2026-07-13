import { getDb } from '../connection';

export interface GadEntry {
  id: number;
  fiscal_year: number | null;
  program: string;
  activity: string | null;
  budget_amount: number | null;
  gad_amount: number | null;
  status: string;
  accomplishment: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const FIELDS = ['fiscal_year', 'program', 'activity', 'budget_amount', 'gad_amount', 'status', 'accomplishment', 'notes'] as const;

export function listGad(params?: { search?: string; status?: string }): GadEntry[] {
  const db = getDb();
  const cond: string[] = [];
  const vals: any[] = [];
  if (params?.search) {
    cond.push('(program LIKE ? OR activity LIKE ?)');
    const q = `%${params.search}%`; vals.push(q, q);
  }
  if (params?.status && params.status !== 'all') { cond.push('status = ?'); vals.push(params.status); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM gad_entries ${where} ORDER BY fiscal_year DESC, id DESC`).all(...vals) as GadEntry[];
}

export function getGadById(id: number): GadEntry | undefined {
  return getDb().prepare('SELECT * FROM gad_entries WHERE id = ?').get(id) as GadEntry | undefined;
}

export function createGad(data: Partial<GadEntry> & { program: string }): number {
  const db = getDb();
  const cols = FIELDS.filter((f) => (data as any)[f] !== undefined);
  const sql = `INSERT INTO gad_entries (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const res = db.prepare(sql).run(...cols.map((c) => (data as any)[c] ?? null));
  return res.lastInsertRowid as number;
}

export function updateGad(id: number, data: Partial<GadEntry>): void {
  const db = getDb();
  const set: string[] = []; const vals: any[] = [];
  for (const f of FIELDS) if ((data as any)[f] !== undefined) { set.push(`${f} = ?`); vals.push((data as any)[f]); }
  if (!set.length) return;
  set.push("updated_at = datetime('now')"); vals.push(id);
  db.prepare(`UPDATE gad_entries SET ${set.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteGad(id: number): void {
  getDb().prepare('DELETE FROM gad_entries WHERE id = ?').run(id);
}
