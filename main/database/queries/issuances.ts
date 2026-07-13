import { getDb } from '../connection';
import { v4 as uuidv4 } from 'uuid';

export type IssuanceType = 'ordinance' | 'resolution' | 'executive_order';

export interface Issuance {
  id: number;
  issuance_uid: string | null;
  type: IssuanceType;
  reference_no: string | null;
  title: string;
  date_enacted: string | null;
  author: string | null;
  status: string;
  full_text: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function listIssuances(params?: { search?: string; type?: string }): Issuance[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: any[] = [];
  if (params?.search) {
    conditions.push('(title LIKE ? OR reference_no LIKE ? OR author LIKE ? OR full_text LIKE ?)');
    const q = `%${params.search}%`;
    values.push(q, q, q, q);
  }
  if (params?.type && params.type !== 'all') {
    conditions.push('type = ?');
    values.push(params.type);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT * FROM issuances
    ${where}
    ORDER BY COALESCE(date_enacted, created_at) DESC, id DESC
  `).all(...values) as Issuance[];
}

export function getIssuanceById(id: number): Issuance | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM issuances WHERE id = ?').get(id) as Issuance | undefined;
}

export function createIssuance(data: Partial<Issuance> & { title: string }): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO issuances (issuance_uid, type, reference_no, title, date_enacted, author, status, full_text, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(), data.type || 'ordinance', data.reference_no ?? null, data.title,
    data.date_enacted ?? null, data.author ?? null, data.status || 'enacted',
    data.full_text ?? null, data.notes ?? null,
  );
  return result.lastInsertRowid as number;
}

export function updateIssuance(id: number, data: Partial<Issuance>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  for (const key of ['type', 'reference_no', 'title', 'date_enacted', 'author', 'status', 'full_text', 'notes'] as const) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE issuances SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteIssuance(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM issuances WHERE id = ?').run(id);
}
