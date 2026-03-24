import { getDb } from '../connection';

export interface GeneratedReport {
  id: number;
  template_id: number | null;
  resident_id: number | null;
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

export function createGeneratedReport(data: {
  template_id: number;
  resident_id: number;
  content_html: string;
  generated_by: number;
}): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO generated_reports (template_id, resident_id, content_html, generated_by) VALUES (?, ?, ?, ?)'
  ).run(data.template_id, data.resident_id, data.content_html, data.generated_by);
  return result.lastInsertRowid as number;
}
