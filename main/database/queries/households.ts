import { getDb } from '../connection';

export interface Household {
  id: number;
  household_number: string | null;
  address: string;
  created_at: string;
}

export function listHouseholds(): Household[] {
  const db = getDb();
  return db.prepare('SELECT * FROM households ORDER BY household_number ASC').all() as Household[];
}

export function createHousehold(data: { household_number?: string; address: string }): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO households (household_number, address) VALUES (?, ?)'
  ).run(data.household_number || null, data.address);
  return result.lastInsertRowid as number;
}

export function updateHousehold(id: number, data: { household_number?: string; address?: string }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.household_number !== undefined) { fields.push('household_number = ?'); values.push(data.household_number); }
  if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address); }

  if (fields.length === 0) return;
  values.push(id);

  db.prepare(`UPDATE households SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteHousehold(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM households WHERE id = ?').run(id);
}
