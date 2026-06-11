import { getDb } from '../connection';

export interface ResidentIssue {
  id: number;
  resident_id: number;
  title: string;
  details: string | null;
  status: 'open' | 'resolved';
  created_by: number | null;
  created_at: string;
  resolved_at: string | null;
}

export function listIssuesForResident(residentId: number): ResidentIssue[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM resident_issues WHERE resident_id = ? ORDER BY status ASC, created_at DESC'
  ).all(residentId) as ResidentIssue[];
}

export function createIssue(data: { resident_id: number; title: string; details?: string | null; created_by: number }): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO resident_issues (resident_id, title, details, created_by) VALUES (?, ?, ?, ?)'
  ).run(data.resident_id, data.title, data.details ?? null, data.created_by);
  return result.lastInsertRowid as number;
}

export function updateIssue(id: number, data: { title?: string; details?: string | null; status?: 'open' | 'resolved' }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.details !== undefined) { fields.push('details = ?'); values.push(data.details); }
  if (data.status !== undefined) {
    fields.push('status = ?');
    values.push(data.status);
    fields.push(data.status === 'resolved' ? "resolved_at = datetime('now')" : 'resolved_at = NULL');
  }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE resident_issues SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteIssue(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM resident_issues WHERE id = ?').run(id);
}

// Watchlist: every resident with at least one open issue (plus their case count)
export interface FlaggedResident {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  gender: string;
  purok: string | null;
  open_issues: number;
  total_issues: number;
  case_count: number;
  latest_issue: string | null;
  latest_issue_at: string | null;
}

export function listFlaggedResidents(search?: string): FlaggedResident[] {
  const db = getDb();
  const conditions = search
    ? `AND (r.first_name LIKE @q OR r.last_name LIKE @q)`
    : '';
  return db.prepare(`
    SELECT r.id, r.first_name, r.middle_name, r.last_name, r.suffix, r.gender, r.purok,
      SUM(CASE WHEN i.status = 'open' THEN 1 ELSE 0 END) as open_issues,
      COUNT(i.id) as total_issues,
      (SELECT COUNT(*) FROM case_parties p WHERE p.resident_id = r.id) +
        (SELECT COUNT(*) FROM cases c WHERE (c.complainant_id = r.id OR c.respondent_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM case_parties p2 WHERE p2.case_id = c.id)) as case_count,
      (SELECT title FROM resident_issues i2 WHERE i2.resident_id = r.id ORDER BY i2.created_at DESC LIMIT 1) as latest_issue,
      (SELECT created_at FROM resident_issues i3 WHERE i3.resident_id = r.id ORDER BY i3.created_at DESC LIMIT 1) as latest_issue_at
    FROM residents r
    JOIN resident_issues i ON i.resident_id = r.id
    WHERE 1=1 ${conditions}
    GROUP BY r.id
    HAVING SUM(CASE WHEN i.status = 'open' THEN 1 ELSE 0 END) > 0
    ORDER BY latest_issue_at DESC
  `).all(search ? { q: `%${search}%` } : {}) as FlaggedResident[];
}
