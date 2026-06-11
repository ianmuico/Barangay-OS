import { getDb } from '../connection';

export interface Case {
  id: number;
  case_number: string;
  case_type: string;
  complainant_id: number | null;
  respondent_id: number | null;
  description: string | null;
  status: string;
  filed_date: string;
  resolved_date: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  complainant_name?: string;
  respondent_name?: string;
  // Aggregated from case_parties ("Juan Cruz, Maria Santos")
  complainant_names?: string;
  respondent_names?: string;
}

export interface CaseParty {
  id: number;
  case_id: number;
  resident_id: number | null;
  role: 'complainant' | 'respondent';
  name?: string;
}

export interface Summon {
  id: number;
  case_id: number;
  summoned_resident_id: number | null;
  summon_number: number;
  summon_date: string;
  summon_time: string | null;
  status: string;
  served_by_official_id: number | null;
  notes: string | null;
  created_at: string;
  // Joined
  summoned_name?: string;
  official_name?: string;
  case_number?: string;
}

export interface CaseCreateData {
  case_type: string;
  complainant_id?: number | null;
  respondent_id?: number | null;
  description?: string | null;
  filed_date?: string;
}

export interface CaseUpdateData {
  case_type?: string;
  complainant_id?: number | null;
  respondent_id?: number | null;
  description?: string | null;
  status?: string;
  filed_date?: string;
  resolved_date?: string | null;
  resolution_notes?: string | null;
}

export interface SummonCreateData {
  case_id: number;
  summoned_resident_id?: number | null;
  summon_number?: number;
  summon_date: string;
  summon_time?: string | null;
  status?: string;
  served_by_official_id?: number | null;
  notes?: string | null;
}

export interface SummonUpdateData {
  summoned_resident_id?: number | null;
  summon_number?: number;
  summon_date?: string;
  summon_time?: string | null;
  status?: string;
  served_by_official_id?: number | null;
  notes?: string | null;
}

// ─── Cases ────────────────────────────────────────────────────────────────────

export function listCases(params?: { search?: string; status?: string }): Case[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (params?.search) {
    conditions.push(`(c.case_number LIKE ? OR c.description LIKE ? OR comp.first_name || ' ' || comp.last_name LIKE ? OR resp.first_name || ' ' || resp.last_name LIKE ?
      OR EXISTS (SELECT 1 FROM case_parties p JOIN residents pr ON p.resident_id = pr.id WHERE p.case_id = c.id AND pr.first_name || ' ' || pr.last_name LIKE ?))`);
    const q = `%${params.search}%`;
    values.push(q, q, q, q, q);
  }

  if (params?.status) {
    conditions.push('c.status = ?');
    values.push(params.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      c.*,
      COALESCE(comp.first_name || ' ' || comp.last_name || COALESCE(' ' || comp.suffix, ''), '') AS complainant_name,
      COALESCE(resp.first_name || ' ' || resp.last_name || COALESCE(' ' || resp.suffix, ''), '') AS respondent_name,
      COALESCE((SELECT GROUP_CONCAT(pr.first_name || ' ' || pr.last_name || COALESCE(' ' || pr.suffix, ''), ', ')
        FROM case_parties p JOIN residents pr ON p.resident_id = pr.id
        WHERE p.case_id = c.id AND p.role = 'complainant'), '') AS complainant_names,
      COALESCE((SELECT GROUP_CONCAT(pr.first_name || ' ' || pr.last_name || COALESCE(' ' || pr.suffix, ''), ', ')
        FROM case_parties p JOIN residents pr ON p.resident_id = pr.id
        WHERE p.case_id = c.id AND p.role = 'respondent'), '') AS respondent_names
    FROM cases c
    LEFT JOIN residents comp ON c.complainant_id = comp.id
    LEFT JOIN residents resp ON c.respondent_id = resp.id
    ${where}
    ORDER BY c.filed_date DESC, c.id DESC
  `;

  return db.prepare(sql).all(...values) as Case[];
}

export function getCaseById(id: number): Case | undefined {
  const db = getDb();
  const sql = `
    SELECT
      c.*,
      COALESCE(comp.first_name || ' ' || comp.last_name || COALESCE(' ' || comp.suffix, ''), '') AS complainant_name,
      COALESCE(resp.first_name || ' ' || resp.last_name || COALESCE(' ' || resp.suffix, ''), '') AS respondent_name,
      COALESCE((SELECT GROUP_CONCAT(pr.first_name || ' ' || pr.last_name || COALESCE(' ' || pr.suffix, ''), ', ')
        FROM case_parties p JOIN residents pr ON p.resident_id = pr.id
        WHERE p.case_id = c.id AND p.role = 'complainant'), '') AS complainant_names,
      COALESCE((SELECT GROUP_CONCAT(pr.first_name || ' ' || pr.last_name || COALESCE(' ' || pr.suffix, ''), ', ')
        FROM case_parties p JOIN residents pr ON p.resident_id = pr.id
        WHERE p.case_id = c.id AND p.role = 'respondent'), '') AS respondent_names
    FROM cases c
    LEFT JOIN residents comp ON c.complainant_id = comp.id
    LEFT JOIN residents resp ON c.respondent_id = resp.id
    WHERE c.id = ?
  `;
  return db.prepare(sql).get(id) as Case | undefined;
}

export function createCase(data: CaseCreateData): number {
  const db = getDb();

  // Auto-generate case_number
  const year = new Date().getFullYear();
  const countResult = db.prepare("SELECT COUNT(*) as count FROM cases WHERE case_number LIKE ?").get(`${year}-%`) as { count: number };
  const num = countResult.count + 1;
  const caseNumber = `${year}-${String(num).padStart(3, '0')}`;

  const sql = `
    INSERT INTO cases (case_number, case_type, complainant_id, respondent_id, description, filed_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const result = db.prepare(sql).run(
    caseNumber,
    data.case_type,
    data.complainant_id ?? null,
    data.respondent_id ?? null,
    data.description ?? null,
    data.filed_date || new Date().toISOString().split('T')[0],
  );

  return result.lastInsertRowid as number;
}

export function updateCase(id: number, data: CaseUpdateData): { success: boolean } {
  const db = getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.case_type !== undefined) { fields.push('case_type = ?'); values.push(data.case_type); }
  if (data.complainant_id !== undefined) { fields.push('complainant_id = ?'); values.push(data.complainant_id); }
  if (data.respondent_id !== undefined) { fields.push('respondent_id = ?'); values.push(data.respondent_id); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.filed_date !== undefined) { fields.push('filed_date = ?'); values.push(data.filed_date); }
  if (data.resolved_date !== undefined) { fields.push('resolved_date = ?'); values.push(data.resolved_date); }
  if (data.resolution_notes !== undefined) { fields.push('resolution_notes = ?'); values.push(data.resolution_notes); }

  if (fields.length === 0) return { success: true };

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const sql = `UPDATE cases SET ${fields.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);
  return { success: true };
}

export function deleteCase(id: number): { success: boolean } {
  const db = getDb();
  db.prepare('DELETE FROM cases WHERE id = ?').run(id);
  return { success: true };
}

export function getCaseCount(): number {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM cases WHERE status IN ('pending', 'ongoing')").get() as { count: number };
  return result.count;
}

// ─── Case parties (multiple complainants/respondents) ───────────────────────

export function listCaseParties(caseId: number): CaseParty[] {
  const db = getDb();
  return db.prepare(`
    SELECT p.*, COALESCE(r.first_name || ' ' || r.last_name || COALESCE(' ' || r.suffix, ''), '') AS name
    FROM case_parties p
    LEFT JOIN residents r ON p.resident_id = r.id
    WHERE p.case_id = ?
    ORDER BY p.role ASC, p.id ASC
  `).all(caseId) as CaseParty[];
}

// Replace all parties for a case and keep the legacy single-party columns in
// sync (first complainant/respondent) so older documents keep working.
export function setCaseParties(caseId: number, parties: { resident_id: number; role: 'complainant' | 'respondent' }[]): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM case_parties WHERE case_id = ?').run(caseId);
    const insert = db.prepare('INSERT INTO case_parties (case_id, resident_id, role) VALUES (?, ?, ?)');
    for (const party of parties) {
      if (!party.resident_id) continue;
      insert.run(caseId, party.resident_id, party.role);
    }
    const firstComplainant = parties.find(p => p.role === 'complainant')?.resident_id ?? null;
    const firstRespondent = parties.find(p => p.role === 'respondent')?.resident_id ?? null;
    db.prepare('UPDATE cases SET complainant_id = ?, respondent_id = ? WHERE id = ?')
      .run(firstComplainant, firstRespondent, caseId);
  });
  tx();
}

// ─── Summons ──────────────────────────────────────────────────────────────────

export function listSummons(caseId: number): Summon[] {
  const db = getDb();
  const sql = `
    SELECT
      s.*,
      COALESCE(r.first_name || ' ' || r.last_name || COALESCE(' ' || r.suffix, ''), '') AS summoned_name,
      COALESCE(
        (SELECT res.first_name || ' ' || res.last_name FROM officials o JOIN residents res ON o.resident_id = res.id WHERE o.id = s.served_by_official_id),
        ''
      ) AS official_name,
      c.case_number
    FROM summons s
    LEFT JOIN residents r ON s.summoned_resident_id = r.id
    LEFT JOIN cases c ON s.case_id = c.id
    WHERE s.case_id = ?
    ORDER BY s.summon_number ASC, s.summon_date ASC
  `;
  return db.prepare(sql).all(caseId) as Summon[];
}

export function createSummon(data: SummonCreateData): number {
  const db = getDb();

  // Auto-determine summon_number if not provided
  let summonNumber = data.summon_number;
  if (!summonNumber) {
    const result = db.prepare('SELECT COALESCE(MAX(summon_number), 0) + 1 as next FROM summons WHERE case_id = ?').get(data.case_id) as { next: number };
    summonNumber = result.next;
  }

  const sql = `
    INSERT INTO summons (case_id, summoned_resident_id, summon_number, summon_date, summon_time, status, served_by_official_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const result = db.prepare(sql).run(
    data.case_id,
    data.summoned_resident_id ?? null,
    summonNumber,
    data.summon_date,
    data.summon_time ?? null,
    data.status || 'scheduled',
    data.served_by_official_id ?? null,
    data.notes ?? null,
  );

  return result.lastInsertRowid as number;
}

export function updateSummon(id: number, data: SummonUpdateData): { success: boolean } {
  const db = getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.summoned_resident_id !== undefined) { fields.push('summoned_resident_id = ?'); values.push(data.summoned_resident_id); }
  if (data.summon_number !== undefined) { fields.push('summon_number = ?'); values.push(data.summon_number); }
  if (data.summon_date !== undefined) { fields.push('summon_date = ?'); values.push(data.summon_date); }
  if (data.summon_time !== undefined) { fields.push('summon_time = ?'); values.push(data.summon_time); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.served_by_official_id !== undefined) { fields.push('served_by_official_id = ?'); values.push(data.served_by_official_id); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }

  if (fields.length === 0) return { success: true };

  values.push(id);
  const sql = `UPDATE summons SET ${fields.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);
  return { success: true };
}

export function deleteSummon(id: number): { success: boolean } {
  const db = getDb();
  db.prepare('DELETE FROM summons WHERE id = ?').run(id);
  return { success: true };
}

export function getUpcomingSummons(limit: number = 10): Summon[] {
  const db = getDb();
  const sql = `
    SELECT
      s.*,
      COALESCE(r.first_name || ' ' || r.last_name || COALESCE(' ' || r.suffix, ''), '') AS summoned_name,
      COALESCE(
        (SELECT res.first_name || ' ' || res.last_name FROM officials o JOIN residents res ON o.resident_id = res.id WHERE o.id = s.served_by_official_id),
        ''
      ) AS official_name,
      c.case_number
    FROM summons s
    LEFT JOIN residents r ON s.summoned_resident_id = r.id
    LEFT JOIN cases c ON s.case_id = c.id
    WHERE s.status = 'scheduled' AND s.summon_date >= date('now')
    ORDER BY s.summon_date ASC, s.summon_time ASC
    LIMIT ?
  `;
  return db.prepare(sql).all(limit) as Summon[];
}
