import { getDb } from '../connection';

export interface GeneratedReport {
  id: number;
  template_id: number | null;
  resident_id: number | null;
  case_id: number | null;
  business_id: number | null;
  title: string | null;
  content_html: string;
  generated_by: number | null;
  generated_at: string;
  template_name?: string;
  resident_name?: string;
}

export function listGeneratedReports(residentId?: number): GeneratedReport[] {
  const db = getDb();
  const query = `
    SELECT gr.*, rt.name as template_name,
      (r.first_name || ' ' || r.last_name) as resident_name
    FROM generated_reports gr
    LEFT JOIN report_templates rt ON gr.template_id = rt.id
    LEFT JOIN residents r ON gr.resident_id = r.id
    ${residentId ? 'WHERE gr.resident_id = ?' : ''}
    ORDER BY gr.generated_at DESC
  `;

  if (residentId) {
    return db.prepare(query).all(residentId) as GeneratedReport[];
  }
  return db.prepare(query).all() as GeneratedReport[];
}

// Saved documents for a case (record, narrative, summons notice, custom docs)
export function listCaseDocuments(caseId: number): GeneratedReport[] {
  const db = getDb();
  return db.prepare(`
    SELECT gr.*, rt.name as template_name,
      (r.first_name || ' ' || r.last_name) as resident_name
    FROM generated_reports gr
    LEFT JOIN report_templates rt ON gr.template_id = rt.id
    LEFT JOIN residents r ON gr.resident_id = r.id
    WHERE gr.case_id = ?
    ORDER BY gr.generated_at DESC
  `).all(caseId) as GeneratedReport[];
}

export function createGeneratedReport(data: {
  template_id?: number | null;
  resident_id?: number | null;
  case_id?: number | null;
  business_id?: number | null;
  title?: string | null;
  content_html: string;
  generated_by: number;
}): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO generated_reports (template_id, resident_id, case_id, business_id, title, content_html, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(data.template_id ?? null, data.resident_id ?? null, data.case_id ?? null, data.business_id ?? null, data.title ?? null, data.content_html, data.generated_by);
  return result.lastInsertRowid as number;
}

export function getGeneratedReportById(id: number): GeneratedReport | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT gr.*, rt.name as template_name,
      (r.first_name || ' ' || r.last_name) as resident_name
    FROM generated_reports gr
    LEFT JOIN report_templates rt ON gr.template_id = rt.id
    LEFT JOIN residents r ON gr.resident_id = r.id
    WHERE gr.id = ?
  `).get(id) as GeneratedReport | undefined;
}

// Re-saving an edited document updates it in place (no duplicate copies)
export function updateGeneratedReport(id: number, data: { title?: string | null; content_html?: string }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.content_html !== undefined) { fields.push('content_html = ?'); values.push(data.content_html); }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE generated_reports SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteGeneratedReport(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM generated_reports WHERE id = ?').run(id);
}

// Library listing — excludes content_html so thousands of rows stay light
export interface DocumentListItem {
  id: number;
  title: string | null;
  template_name: string | null;
  resident_id: number | null;
  resident_name: string | null;
  case_id: number | null;
  case_number: string | null;
  business_id: number | null;
  business_name: string | null;
  size_bytes: number;
  generated_at: string;
}

export function listDocuments(params: { search?: string; type?: 'all' | 'resident' | 'case' | 'business'; page?: number; limit?: number }): { data: DocumentListItem[]; total: number; page: number; totalPages: number } {
  const db = getDb();
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 25));
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.search) {
    conditions.push(`(gr.title LIKE ? OR rt.name LIKE ? OR (r.first_name || ' ' || r.last_name) LIKE ? OR c.case_number LIKE ? OR b.name LIKE ?)`);
    const q = `%${params.search}%`;
    values.push(q, q, q, q, q);
  }
  if (params.type === 'resident') conditions.push('gr.resident_id IS NOT NULL');
  if (params.type === 'case') conditions.push('gr.case_id IS NOT NULL');
  if (params.type === 'business') conditions.push('gr.business_id IS NOT NULL');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const base = `
    FROM generated_reports gr
    LEFT JOIN report_templates rt ON gr.template_id = rt.id
    LEFT JOIN residents r ON gr.resident_id = r.id
    LEFT JOIN cases c ON gr.case_id = c.id
    LEFT JOIN businesses b ON gr.business_id = b.id
    ${where}
  `;
  const total = (db.prepare(`SELECT COUNT(*) as n ${base}`).get(...values) as { n: number }).n;
  const data = db.prepare(`
    SELECT gr.id, gr.title, rt.name as template_name, gr.resident_id,
      (r.first_name || ' ' || r.last_name) as resident_name,
      gr.case_id, c.case_number,
      gr.business_id, b.name as business_name,
      LENGTH(gr.content_html) as size_bytes, gr.generated_at
    ${base}
    ORDER BY gr.generated_at DESC
    LIMIT ? OFFSET ?
  `).all(...values, limit, (page - 1) * limit) as DocumentListItem[];

  return { data, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// ─── Storage failsafe ────────────────────────────────────────────────────────
// content_html is the bulky part (custom documents with embedded images can be
// megabytes). These power the Storage card in Settings → Backup.

export function getReportStorageStats(): { count: number; totalBytes: number; oldest: string | null } {
  const db = getDb();
  return db.prepare(
    'SELECT COUNT(*) as count, COALESCE(SUM(LENGTH(content_html)), 0) as totalBytes, MIN(generated_at) as oldest FROM generated_reports'
  ).get() as { count: number; totalBytes: number; oldest: string | null };
}

// Deletes only the stored DOCUMENTS — resident/case records stay untouched.
export function cleanupGeneratedReports(olderThanDays: number): number {
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM generated_reports WHERE generated_at < datetime('now', ?)"
  ).run(`-${Math.max(1, Math.floor(olderThanDays))} days`);
  return result.changes;
}
