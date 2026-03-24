import { getDb } from '../connection';

export interface Official {
  id: number;
  resident_id: number | null;
  position: string;
  start_date: string | null;
  end_date: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // joined fields
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  photo_path?: string;
}

export function listOfficials(): Official[] {
  const db = getDb();
  return db.prepare(`
    SELECT o.*, r.first_name, r.last_name, r.middle_name, r.suffix, r.photo_path
    FROM officials o
    LEFT JOIN residents r ON o.resident_id = r.id
    ORDER BY o.sort_order ASC, o.created_at ASC
  `).all() as Official[];
}

export function getOfficialById(id: number): Official | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT o.*, r.first_name, r.last_name, r.middle_name, r.suffix, r.photo_path
    FROM officials o
    LEFT JOIN residents r ON o.resident_id = r.id
    WHERE o.id = ?
  `).get(id) as Official | undefined;
}

export function createOfficial(data: { resident_id: number | null; position: string; start_date?: string; end_date?: string; sort_order?: number }): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO officials (resident_id, position, start_date, end_date, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.resident_id, data.position, data.start_date || null, data.end_date || null, data.sort_order || 0);
  return result.lastInsertRowid as number;
}

export function updateOfficial(id: number, data: Partial<{ resident_id: number | null; position: string; start_date: string; end_date: string; is_active: number; sort_order: number }>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  const allowedFields = ['resident_id', 'position', 'start_date', 'end_date', 'is_active', 'sort_order'];
  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE officials SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteOfficial(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM officials WHERE id = ?').run(id);
}
