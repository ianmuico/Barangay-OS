import { getDb } from '../connection';
import { v4 as uuidv4 } from 'uuid';

export interface Household {
  id: number;
  household_number: string | null;
  address: string;
  purok: string | null;
  housing_type: string | null;
  head_resident_id: number | null;
  household_uid: string | null;
  created_at: string;
}

export interface HouseholdWithMeta extends Household {
  head_name: string | null;
  member_count: number;
}

export function listHouseholds(params: { search?: string } = {}): HouseholdWithMeta[] {
  const db = getDb();
  const search = (params.search || '').trim();
  const where = search
    ? `WHERE h.household_number LIKE @q OR h.address LIKE @q OR h.purok LIKE @q
        OR (hr.first_name || ' ' || hr.last_name) LIKE @q`
    : '';
  return db.prepare(`
    SELECT h.*,
      CASE WHEN hr.id IS NULL THEN NULL ELSE (hr.first_name || ' ' || hr.last_name) END AS head_name,
      (SELECT COUNT(*) FROM residents m WHERE m.household_id = h.id) AS member_count
    FROM households h
    LEFT JOIN residents hr ON hr.id = h.head_resident_id
    ${where}
    ORDER BY h.household_number ASC
  `).all(search ? { q: `%${search}%` } : {}) as HouseholdWithMeta[];
}

export function getHouseholdById(id: number): HouseholdWithMeta | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT h.*,
      CASE WHEN hr.id IS NULL THEN NULL ELSE (hr.first_name || ' ' || hr.last_name) END AS head_name,
      (SELECT COUNT(*) FROM residents m WHERE m.household_id = h.id) AS member_count
    FROM households h
    LEFT JOIN residents hr ON hr.id = h.head_resident_id
    WHERE h.id = ?
  `).get(id) as HouseholdWithMeta | undefined;
}

export function getHouseholdMembers(householdId: number): any[] {
  const db = getDb();
  return db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    WHERE household_id = ?
    ORDER BY (id = (SELECT head_resident_id FROM households WHERE id = ?)) DESC, last_name, first_name
  `).all(householdId, householdId);
}

export function createHousehold(data: {
  household_number?: string; address: string; purok?: string; housing_type?: string; head_resident_id?: number | null;
}): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO households (household_number, address, purok, housing_type, head_resident_id, household_uid)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    data.household_number || null, data.address, data.purok || null,
    data.housing_type || null, data.head_resident_id || null, uuidv4()
  );
  return result.lastInsertRowid as number;
}

export function updateHousehold(id: number, data: {
  household_number?: string; address?: string; purok?: string; housing_type?: string; head_resident_id?: number | null;
}): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  const allowed = ['household_number', 'address', 'purok', 'housing_type', 'head_resident_id'];
  for (const key of allowed) {
    if ((data as any)[key] !== undefined) { fields.push(`${key} = ?`); values.push((data as any)[key]); }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE households SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteHousehold(id: number): void {
  const db = getDb();
  // residents.household_id is ON DELETE SET NULL, so members are detached, not deleted.
  db.prepare('DELETE FROM households WHERE id = ?').run(id);
}

// Add or move a resident into a household, with their relationship to the head.
export function addHouseholdMember(householdId: number, residentId: number, relationship?: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE residents SET household_id = ?, relationship_to_head = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(householdId, relationship || null, residentId);
}

export function removeHouseholdMember(residentId: number): void {
  const db = getDb();
  const row = db.prepare('SELECT household_id FROM residents WHERE id = ?').get(residentId) as { household_id: number | null } | undefined;
  db.prepare(
    "UPDATE residents SET household_id = NULL, relationship_to_head = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(residentId);
  // If this resident was the head, clear the household head.
  if (row?.household_id) {
    db.prepare('UPDATE households SET head_resident_id = NULL WHERE id = ? AND head_resident_id = ?').run(row.household_id, residentId);
  }
}

export function setHouseholdHead(householdId: number, residentId: number): void {
  const db = getDb();
  // Ensure the head is a member of the household.
  db.prepare("UPDATE residents SET household_id = ? WHERE id = ?").run(householdId, residentId);
  db.prepare('UPDATE households SET head_resident_id = ? WHERE id = ?').run(residentId, householdId);
  db.prepare("UPDATE residents SET relationship_to_head = 'Head' WHERE id = ?").run(residentId);
}
