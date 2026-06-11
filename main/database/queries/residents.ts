import { getDb } from '../connection';
import { v4 as uuidv4 } from 'uuid';

export interface Resident {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: string;
  gender: string;
  civil_status: string;
  address: string;
  purok: string | null;
  contact_number: string | null;
  email: string | null;
  occupation: string | null;
  is_indigent: number;
  voter_status: string;
  blood_type: string | null;
  photo_path: string | null;
  household_id: number | null;
  partner_id: number | null;
  mother_id: number | null;
  father_id: number | null;
  notes: string | null;
  religion: string | null;
  citizenship: string | null;
  philsys_card_no: string | null;
  educational_attainment: string | null;
  is_4ps: number;
  status: string;
  import_batch_id: number | null;
  resident_uid?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResidentQueryParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  is_indigent?: boolean;
  is_senior?: boolean;
  is_youth?: boolean;
  is_4ps?: boolean;
  gender?: string;
  status?: string; // 'living' | 'deceased' | 'all' — defaults to 'living'
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function listResidents(params: ResidentQueryParams = {}): PaginatedResult<Resident & { age: number }> {
  const db = getDb();
  const {
    search = '',
    page = 1,
    limit = 50,
    sortBy = 'last_name',
    sortOrder = 'asc',
    is_indigent,
    is_senior,
    is_youth,
    is_4ps,
    gender,
    status = 'living',
  } = params;

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  // Filter by status (living by default)
  if (status !== 'all') {
    conditions.push('status = ?');
    values.push(status);
  }

  if (search) {
    // Split search into words so "Juan Santos" matches first_name=Juan + last_name=Santos
    const words = search.trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      // Each word must match at least one name/address field
      const wordConditions = words.map(() =>
        "(first_name LIKE ? OR last_name LIKE ? OR address LIKE ? OR purok LIKE ?)"
      );
      conditions.push(`(${wordConditions.join(' AND ')})`);
      for (const word of words) {
        const term = `%${word}%`;
        values.push(term, term, term, term);
      }
    } else {
      conditions.push("(first_name LIKE ? OR last_name LIKE ? OR address LIKE ? OR purok LIKE ?)");
      const searchTerm = `%${search}%`;
      values.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
  }

  if (is_indigent !== undefined) {
    conditions.push('is_indigent = ?');
    values.push(is_indigent ? 1 : 0);
  }

  if (is_4ps) {
    conditions.push('is_4ps = 1');
  }

  if (is_senior) {
    conditions.push("(CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER)) >= 60");
  }

  if (is_youth) {
    conditions.push("(CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER)) BETWEEN 15 AND 30");
    conditions.push("(civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))");
  }

  if (gender) {
    conditions.push('gender = ?');
    values.push(gender);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const allowedSortColumns = ['first_name', 'last_name', 'birth_date', 'address', 'purok', 'created_at', 'updated_at', 'gender', 'civil_status'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'last_name';
  const safeSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';

  const countResult = db.prepare(`SELECT COUNT(*) as count FROM residents ${whereClause}`).get(...values) as { count: number };
  const total = countResult.count;

  const offset = (page - 1) * limit;
  const data = db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age,
      (SELECT COUNT(*) FROM case_parties p WHERE p.resident_id = residents.id) +
        (SELECT COUNT(*) FROM cases c WHERE (c.complainant_id = residents.id OR c.respondent_id = residents.id)
          AND NOT EXISTS (SELECT 1 FROM case_parties p2 WHERE p2.case_id = c.id)) as case_count,
      (SELECT COUNT(*) FROM resident_issues i WHERE i.resident_id = residents.id AND i.status = 'open') as open_issues
    FROM residents
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset) as (Resident & { age: number })[];

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function getResidentById(id: number): (Resident & { age: number }) | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents WHERE id = ?
  `).get(id) as (Resident & { age: number }) | undefined;
}

export function getResidentByUid(uid: string): (Resident & { age: number }) | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents WHERE resident_uid = ?
  `).get(uid) as (Resident & { age: number }) | undefined;
}

export function searchResidents(query: string, limit: number = 20): (Resident & { age: number })[] {
  const db = getDb();
  const words = query.trim().split(/\s+/).filter(Boolean);

  if (words.length > 1) {
    // Multi-word: each word must match first_name or last_name
    const wordConditions = words.map(() => "(first_name LIKE ? OR last_name LIKE ?)");
    const whereClause = wordConditions.join(' AND ');
    const values: string[] = [];
    for (const word of words) {
      const term = `%${word}%`;
      values.push(term, term);
    }
    return db.prepare(`
      SELECT *,
        CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
      FROM residents
      WHERE ${whereClause}
      ORDER BY last_name, first_name
      LIMIT ?
    `).all(...values, limit) as (Resident & { age: number })[];
  }

  const searchTerm = `%${query}%`;
  return db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    WHERE first_name LIKE ? OR last_name LIKE ?
    ORDER BY last_name, first_name
    LIMIT ?
  `).all(searchTerm, searchTerm, limit) as (Resident & { age: number })[];
}

export function createResident(data: Partial<Resident> & { first_name: string; last_name: string; birth_date: string; gender: string; civil_status: string }): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO residents (
      first_name, middle_name, last_name, suffix, birth_date, gender,
      civil_status, address, purok, contact_number, email, occupation,
      is_indigent, voter_status, blood_type, photo_path, household_id,
      partner_id, mother_id, father_id, notes,
      religion, citizenship, philsys_card_no, educational_attainment,
      is_4ps, status, import_batch_id, resident_uid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.first_name, data.middle_name || null, data.last_name, data.suffix || null,
    data.birth_date, data.gender, data.civil_status, data.address || '',
    data.purok || null, data.contact_number || null, data.email || null, data.occupation || null,
    data.is_indigent || 0, data.voter_status || 'Not Registered', data.blood_type || null,
    data.photo_path || null, data.household_id || null, data.partner_id || null,
    data.mother_id || null, data.father_id || null, data.notes || null,
    data.religion || null, data.citizenship || 'Filipino', data.philsys_card_no || null,
    data.educational_attainment || null, data.is_4ps || 0, data.status || 'living',
    data.import_batch_id || null, uuidv4()
  );
  const newId = result.lastInsertRowid as number;

  // If partner_id is set, update the partner to link back
  if (data.partner_id) {
    linkPartner(newId, data.partner_id);
  }

  return newId;
}

export function linkPartner(residentId: number, partnerId: number): void {
  const db = getDb();
  db.prepare("UPDATE residents SET partner_id = ?, updated_at = datetime('now') WHERE id = ?").run(partnerId, residentId);
  db.prepare("UPDATE residents SET partner_id = ?, updated_at = datetime('now') WHERE id = ?").run(residentId, partnerId);
}

export function unlinkPartner(residentId: number): void {
  const db = getDb();
  const resident = getResidentById(residentId);
  if (resident?.partner_id) {
    db.prepare("UPDATE residents SET partner_id = NULL, updated_at = datetime('now') WHERE id = ?").run(resident.partner_id);
  }
  db.prepare("UPDATE residents SET partner_id = NULL, updated_at = datetime('now') WHERE id = ?").run(residentId);
}

export function updateResident(id: number, data: Partial<Resident>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = [
    'first_name', 'middle_name', 'last_name', 'suffix', 'birth_date',
    'gender', 'civil_status', 'address', 'purok', 'contact_number', 'email',
    'occupation', 'is_indigent', 'voter_status', 'blood_type',
    'photo_path', 'household_id', 'partner_id', 'mother_id', 'father_id', 'notes',
    'religion', 'citizenship', 'philsys_card_no', 'educational_attainment',
    'is_4ps', 'status', 'import_batch_id', 'death_date'
  ];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE residents SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  // Handle partner linking
  if ('partner_id' in data) {
    if (data.partner_id) {
      linkPartner(id, data.partner_id);
    } else {
      const current = getResidentById(id);
      if (current?.partner_id) {
        db.prepare("UPDATE residents SET partner_id = NULL, updated_at = datetime('now') WHERE id = ?").run(current.partner_id);
      }
    }
  }
}

export function deleteResident(id: number): void {
  const db = getDb();
  unlinkPartner(id);
  db.prepare('DELETE FROM residents WHERE id = ?').run(id);
}

export function getResidentCount(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) as count FROM residents WHERE status = 'living'").get() as { count: number }).count;
}

export function getSeniorCount(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) as count FROM residents WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) >= 60").get() as { count: number }).count;
}

export function getIndigentCount(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) as count FROM residents WHERE status = 'living' AND is_indigent = 1").get() as { count: number }).count;
}

export function getYouthCount(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) as count FROM residents WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) BETWEEN 15 AND 30 AND (civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))").get() as { count: number }).count;
}

export function get4PsCount(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) as count FROM residents WHERE status = 'living' AND is_4ps = 1").get() as { count: number }).count;
}

export function getPartnerRelationships(): any[] {
  const db = getDb();
  return db.prepare(`
    SELECT r1.id, r1.first_name, r1.last_name, r1.partner_id,
           r2.first_name as partner_first_name, r2.last_name as partner_last_name
    FROM residents r1
    JOIN residents r2 ON r1.partner_id = r2.id
    WHERE r1.id < r1.partner_id
  `).all();
}

// ─── Children queries ────────────────────────────────────────────────────────

export function getChildrenOf(residentId: number): (Resident & { age: number })[] {
  const db = getDb();
  return db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    WHERE mother_id = ? OR father_id = ?
    ORDER BY birth_date ASC
  `).all(residentId, residentId) as (Resident & { age: number })[];
}

export function addChildLink(parentId: number, parentGender: string, childId: number): void {
  const db = getDb();
  if (parentGender === 'Female') {
    db.prepare("UPDATE residents SET mother_id = ?, updated_at = datetime('now') WHERE id = ?").run(parentId, childId);
  } else {
    db.prepare("UPDATE residents SET father_id = ?, updated_at = datetime('now') WHERE id = ?").run(parentId, childId);
  }
}

export function removeChildLink(parentId: number, parentGender: string, childId: number): void {
  const db = getDb();
  if (parentGender === 'Female') {
    db.prepare("UPDATE residents SET mother_id = NULL, updated_at = datetime('now') WHERE id = ? AND mother_id = ?").run(childId, parentId);
  } else {
    db.prepare("UPDATE residents SET father_id = NULL, updated_at = datetime('now') WHERE id = ? AND father_id = ?").run(childId, parentId);
  }
}

// ─── Detailed demographic breakdowns for dashboard charts ───────────────────

export function getGenderDistribution(): { gender: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT gender, COUNT(*) as count FROM residents WHERE status = 'living' GROUP BY gender ORDER BY gender
  `).all() as any[];
}

export function getSeniorAgeBrackets(): { bracket: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      CASE
        WHEN age BETWEEN 60 AND 64 THEN '60-64'
        WHEN age BETWEEN 65 AND 69 THEN '65-69'
        WHEN age BETWEEN 70 AND 74 THEN '70-74'
        WHEN age BETWEEN 75 AND 79 THEN '75-79'
        WHEN age >= 80 THEN '80+'
      END as bracket,
      COUNT(*) as count
    FROM (
      SELECT CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
      FROM residents
      WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) >= 60
    )
    GROUP BY bracket
    ORDER BY bracket
  `).all() as any[];
}

export function getIndigentsByPurok(): { purok: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT COALESCE(purok, 'Unassigned') as purok, COUNT(*) as count
    FROM residents
    WHERE status = 'living' AND is_indigent = 1
    GROUP BY purok
    ORDER BY purok
  `).all() as any[];
}

export function getYouthBreakdown(): { category: string; count: number }[] {
  const db = getDb();
  // By age sub-brackets
  const ageBrackets = db.prepare(`
    SELECT
      CASE
        WHEN age BETWEEN 15 AND 17 THEN '15-17'
        WHEN age BETWEEN 18 AND 21 THEN '18-21'
        WHEN age BETWEEN 22 AND 25 THEN '22-25'
        WHEN age BETWEEN 26 AND 30 THEN '26-30'
      END as category,
      COUNT(*) as count
    FROM (
      SELECT CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age,
             civil_status
      FROM residents
      WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) BETWEEN 15 AND 30
        AND (civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))
    )
    GROUP BY category
    ORDER BY category
  `).all() as any[];
  return ageBrackets;
}

export function getYouthByOccupation(): { category: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      CASE
        WHEN LOWER(occupation) LIKE '%student%' OR LOWER(occupation) LIKE '%school%' OR LOWER(occupation) LIKE '%study%' OR LOWER(occupation) LIKE '%scholar%' OR LOWER(occupation) LIKE '%college student%' OR LOWER(occupation) LIKE '%vocational student%' THEN 'Studying'
        WHEN occupation IS NOT NULL AND TRIM(occupation) != '' AND LOWER(occupation) NOT LIKE '%none%' AND LOWER(occupation) NOT LIKE '%n/a%' THEN 'Working'
        ELSE 'Not Specified'
      END as category,
      COUNT(*) as count
    FROM residents
    WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) BETWEEN 15 AND 30
      AND (civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))
    GROUP BY category
    ORDER BY category
  `).all() as any[];
}

export function getResidentsByPurok(): { purok: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT COALESCE(purok, 'Unassigned') as purok, COUNT(*) as count
    FROM residents
    WHERE status = 'living'
    GROUP BY purok
    ORDER BY purok
  `).all() as any[];
}

export function getAgeDistribution(): { bracket: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      CASE
        WHEN age BETWEEN 0 AND 14 THEN '0-14 (Children)'
        WHEN age BETWEEN 15 AND 30 THEN '15-30 (Youth)'
        WHEN age BETWEEN 31 AND 59 THEN '31-59 (Adult)'
        WHEN age >= 60 THEN '60+ (Senior)'
      END as bracket,
      COUNT(*) as count
    FROM (
      SELECT CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
      FROM residents
      WHERE status = 'living'
    )
    GROUP BY bracket
    ORDER BY bracket
  `).all() as any[];
}

export function getAllResidentsForTree(): any[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, first_name, middle_name, last_name, suffix, gender, partner_id, mother_id, father_id, purok,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    ORDER BY last_name, first_name
  `).all();
}
