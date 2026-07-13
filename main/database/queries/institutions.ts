import { getDb } from '../connection';

export interface Institution {
  id: number;
  name: string;
  type: string | null;
  head_name: string | null;
  contact: string | null;
  members_count: number | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const FIELDS = ['name', 'type', 'head_name', 'contact', 'members_count', 'description', 'notes'] as const;

export function listInstitutions(params?: { search?: string; type?: string }): Institution[] {
  const db = getDb();
  const cond: string[] = [];
  const vals: any[] = [];
  if (params?.search) {
    cond.push('(name LIKE ? OR head_name LIKE ? OR description LIKE ?)');
    const q = `%${params.search}%`; vals.push(q, q, q);
  }
  if (params?.type && params.type !== 'all') { cond.push('type = ?'); vals.push(params.type); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM institutions ${where} ORDER BY name ASC`).all(...vals) as Institution[];
}

export function getInstitutionById(id: number): Institution | undefined {
  return getDb().prepare('SELECT * FROM institutions WHERE id = ?').get(id) as Institution | undefined;
}

export function createInstitution(data: Partial<Institution> & { name: string }): number {
  const db = getDb();
  const cols = FIELDS.filter((f) => (data as any)[f] !== undefined);
  const sql = `INSERT INTO institutions (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const res = db.prepare(sql).run(...cols.map((c) => (data as any)[c] ?? null));
  return res.lastInsertRowid as number;
}

export function updateInstitution(id: number, data: Partial<Institution>): void {
  const db = getDb();
  const set: string[] = []; const vals: any[] = [];
  for (const f of FIELDS) if ((data as any)[f] !== undefined) { set.push(`${f} = ?`); vals.push((data as any)[f]); }
  if (!set.length) return;
  set.push("updated_at = datetime('now')"); vals.push(id);
  db.prepare(`UPDATE institutions SET ${set.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteInstitution(id: number): void {
  getDb().prepare('DELETE FROM institutions WHERE id = ?').run(id);
}
