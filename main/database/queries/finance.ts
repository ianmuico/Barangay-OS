import { getDb } from '../connection';

export interface FinancialRecord {
  id: number;
  fiscal_year: number | null;
  category: string;
  account: string | null;
  description: string | null;
  amount: number | null;
  entry_date: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const FIELDS = ['fiscal_year', 'category', 'account', 'description', 'amount', 'entry_date', 'reference_no', 'notes'] as const;

export function listFinancialRecords(params?: { search?: string; category?: string }): FinancialRecord[] {
  const db = getDb();
  const cond: string[] = [];
  const vals: any[] = [];
  if (params?.search) {
    cond.push('(account LIKE ? OR description LIKE ? OR reference_no LIKE ?)');
    const q = `%${params.search}%`; vals.push(q, q, q);
  }
  if (params?.category && params.category !== 'all') { cond.push('category = ?'); vals.push(params.category); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM financial_records ${where} ORDER BY COALESCE(entry_date, created_at) DESC, id DESC`).all(...vals) as FinancialRecord[];
}

export function getFinancialRecordById(id: number): FinancialRecord | undefined {
  return getDb().prepare('SELECT * FROM financial_records WHERE id = ?').get(id) as FinancialRecord | undefined;
}

export function createFinancialRecord(data: Partial<FinancialRecord>): number {
  const db = getDb();
  const cols = FIELDS.filter((f) => (data as any)[f] !== undefined);
  const sql = `INSERT INTO financial_records (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const res = db.prepare(sql).run(...cols.map((c) => (data as any)[c] ?? null));
  return res.lastInsertRowid as number;
}

export function updateFinancialRecord(id: number, data: Partial<FinancialRecord>): void {
  const db = getDb();
  const set: string[] = []; const vals: any[] = [];
  for (const f of FIELDS) if ((data as any)[f] !== undefined) { set.push(`${f} = ?`); vals.push((data as any)[f]); }
  if (!set.length) return;
  set.push("updated_at = datetime('now')"); vals.push(id);
  db.prepare(`UPDATE financial_records SET ${set.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteFinancialRecord(id: number): void {
  getDb().prepare('DELETE FROM financial_records WHERE id = ?').run(id);
}

// Totals by category for the current-year summary.
export function getFinancialSummary(fiscalYear?: number): { category: string; total: number }[] {
  const db = getDb();
  const where = fiscalYear ? 'WHERE fiscal_year = ?' : '';
  const args = fiscalYear ? [fiscalYear] : [];
  return db.prepare(`SELECT category, COALESCE(SUM(amount), 0) as total FROM financial_records ${where} GROUP BY category`).all(...args) as { category: string; total: number }[];
}
