import { getDb } from '../connection';

export interface DisasterRecord {
  id: number;
  record_type: string;
  title: string;
  record_date: string | null;
  location: string | null;
  description: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const FIELDS = ['record_type', 'title', 'record_date', 'location', 'description', 'status', 'notes'] as const;

export function listDisaster(params?: { search?: string; record_type?: string }): DisasterRecord[] {
  const db = getDb();
  const cond: string[] = [];
  const vals: any[] = [];
  if (params?.search) {
    cond.push('(title LIKE ? OR description LIKE ? OR location LIKE ?)');
    const q = `%${params.search}%`; vals.push(q, q, q);
  }
  if (params?.record_type && params.record_type !== 'all') { cond.push('record_type = ?'); vals.push(params.record_type); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM disaster_records ${where} ORDER BY COALESCE(record_date, created_at) DESC, id DESC`).all(...vals) as DisasterRecord[];
}

export function getDisasterById(id: number): DisasterRecord | undefined {
  return getDb().prepare('SELECT * FROM disaster_records WHERE id = ?').get(id) as DisasterRecord | undefined;
}

export function createDisaster(data: Partial<DisasterRecord> & { title: string }): number {
  const db = getDb();
  const cols = FIELDS.filter((f) => (data as any)[f] !== undefined);
  const sql = `INSERT INTO disaster_records (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const res = db.prepare(sql).run(...cols.map((c) => (data as any)[c] ?? null));
  return res.lastInsertRowid as number;
}

export function updateDisaster(id: number, data: Partial<DisasterRecord>): void {
  const db = getDb();
  const set: string[] = []; const vals: any[] = [];
  for (const f of FIELDS) if ((data as any)[f] !== undefined) { set.push(`${f} = ?`); vals.push((data as any)[f]); }
  if (!set.length) return;
  set.push("updated_at = datetime('now')"); vals.push(id);
  db.prepare(`UPDATE disaster_records SET ${set.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteDisaster(id: number): void {
  getDb().prepare('DELETE FROM disaster_records WHERE id = ?').run(id);
}
