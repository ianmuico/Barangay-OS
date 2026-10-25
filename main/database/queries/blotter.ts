import { getDb } from '../connection';
import { v4 as uuidv4 } from 'uuid';

export interface BlotterEntry {
  id: number;
  blotter_uid: string | null;
  entry_no: string | null;
  category: string;
  incident_date: string | null;
  incident_time: string | null;
  location: string | null;
  reported_by: string | null;
  respondent: string | null;
  narrative: string | null;
  action_taken: string | null;
  status: string;
  is_vawc: number;
  created_at: string;
  updated_at: string;
}

export function listBlotter(params?: { search?: string; category?: string }): BlotterEntry[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: any[] = [];
  if (params?.search) {
    conditions.push('(entry_no LIKE ? OR reported_by LIKE ? OR respondent LIKE ? OR narrative LIKE ? OR location LIKE ?)');
    const q = `%${params.search}%`;
    values.push(q, q, q, q, q);
  }
  if (params?.category && params.category !== 'all') {
    if (params.category === 'vawc') conditions.push('is_vawc = 1');
    else conditions.push('category = ?'), values.push(params.category);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT * FROM blotter
    ${where}
    ORDER BY COALESCE(incident_date, created_at) DESC, id DESC
  `).all(...values) as BlotterEntry[];
}

export function getBlotterById(id: number): BlotterEntry | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM blotter WHERE id = ?').get(id) as BlotterEntry | undefined;
}

export function createBlotter(data: Partial<BlotterEntry>): number {
  const db = getDb();
  const year = new Date().getFullYear();
  const maxRow = db.prepare(
    "SELECT MAX(CAST(substr(entry_no, 6) AS INTEGER)) as maxn FROM blotter WHERE entry_no LIKE ?"
  ).get(`${year}-%`) as { maxn: number | null };
  const entryNo = `${year}-${String((maxRow.maxn || 0) + 1).padStart(3, '0')}`;
  const isVawc = data.category === 'vawc' || data.is_vawc ? 1 : 0;
  const result = db.prepare(`
    INSERT INTO blotter (blotter_uid, entry_no, category, incident_date, incident_time, location,
      reported_by, respondent, narrative, action_taken, status, is_vawc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(), entryNo, data.category || 'incident', data.incident_date ?? null, data.incident_time ?? null,
    data.location ?? null, data.reported_by ?? null, data.respondent ?? null, data.narrative ?? null,
    data.action_taken ?? null, data.status || 'open', isVawc,
  );
  return result.lastInsertRowid as number;
}

export function updateBlotter(id: number, data: Partial<BlotterEntry>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  for (const key of ['category', 'incident_date', 'incident_time', 'location', 'reported_by',
    'respondent', 'narrative', 'action_taken', 'status', 'is_vawc'] as const) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
  }
  // Keep is_vawc consistent with a VAWC category.
  if (data.category === 'vawc') { fields.push('is_vawc = ?'); values.push(1); }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE blotter SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteBlotter(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM blotter WHERE id = ?').run(id);
}
