import { getDb } from '../connection';

export interface DevelopmentProject {
  id: number;
  project_name: string;
  sector: string | null;
  description: string | null;
  budget: number | null;
  funding_source: string | null;
  status: string;
  start_date: string | null;
  target_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const FIELDS = ['project_name', 'sector', 'description', 'budget', 'funding_source', 'status', 'start_date', 'target_date', 'notes'] as const;

export function listProjects(params?: { search?: string; status?: string }): DevelopmentProject[] {
  const db = getDb();
  const cond: string[] = [];
  const vals: any[] = [];
  if (params?.search) {
    cond.push('(project_name LIKE ? OR sector LIKE ? OR description LIKE ? OR funding_source LIKE ?)');
    const q = `%${params.search}%`; vals.push(q, q, q, q);
  }
  if (params?.status && params.status !== 'all') { cond.push('status = ?'); vals.push(params.status); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM development_projects ${where} ORDER BY COALESCE(start_date, created_at) DESC, id DESC`).all(...vals) as DevelopmentProject[];
}

export function getProjectById(id: number): DevelopmentProject | undefined {
  return getDb().prepare('SELECT * FROM development_projects WHERE id = ?').get(id) as DevelopmentProject | undefined;
}

export function createProject(data: Partial<DevelopmentProject> & { project_name: string }): number {
  const db = getDb();
  const cols = FIELDS.filter((f) => (data as any)[f] !== undefined);
  const sql = `INSERT INTO development_projects (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const res = db.prepare(sql).run(...cols.map((c) => (data as any)[c] ?? null));
  return res.lastInsertRowid as number;
}

export function updateProject(id: number, data: Partial<DevelopmentProject>): void {
  const db = getDb();
  const set: string[] = []; const vals: any[] = [];
  for (const f of FIELDS) if ((data as any)[f] !== undefined) { set.push(`${f} = ?`); vals.push((data as any)[f]); }
  if (!set.length) return;
  set.push("updated_at = datetime('now')"); vals.push(id);
  db.prepare(`UPDATE development_projects SET ${set.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteProject(id: number): void {
  getDb().prepare('DELETE FROM development_projects WHERE id = ?').run(id);
}
