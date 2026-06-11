import { getDb } from '../connection';

export interface ReportTemplate {
  id: number;
  name: string;
  content_html: string;
  variables_json: string;
  paper_json: string | null;
  pages_json: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export function listTemplates(): ReportTemplate[] {
  const db = getDb();
  return db.prepare('SELECT * FROM report_templates ORDER BY name ASC').all() as ReportTemplate[];
}

export function getTemplateById(id: number): ReportTemplate | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as ReportTemplate | undefined;
}

export function createTemplate(data: {
  name: string;
  content_html: string;
  variables_json: string;
  paper_json?: string | null;
  pages_json?: string | null;
  created_by: number;
}): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO report_templates (name, content_html, variables_json, paper_json, pages_json, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(data.name, data.content_html, data.variables_json, data.paper_json ?? null, data.pages_json ?? null, data.created_by);
  return result.lastInsertRowid as number;
}

export function updateTemplate(id: number, data: {
  name?: string;
  content_html?: string;
  variables_json?: string;
  paper_json?: string | null;
  pages_json?: string | null;
}): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.content_html !== undefined) { fields.push('content_html = ?'); values.push(data.content_html); }
  if (data.variables_json !== undefined) { fields.push('variables_json = ?'); values.push(data.variables_json); }
  if (data.paper_json !== undefined) { fields.push('paper_json = ?'); values.push(data.paper_json); }
  if (data.pages_json !== undefined) { fields.push('pages_json = ?'); values.push(data.pages_json); }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE report_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteTemplate(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM report_templates WHERE id = ?').run(id);
}
