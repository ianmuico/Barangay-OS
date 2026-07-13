import { getDb } from '../connection';
import { v4 as uuidv4 } from 'uuid';

export interface Asset {
  id: number;
  asset_uid: string | null;
  item_name: string;
  category: string | null;
  description: string | null;
  acquisition_date: string | null;
  acquisition_cost: number | null;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  condition: string | null;
  custodian: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const FIELDS = ['item_name', 'category', 'description', 'acquisition_date', 'acquisition_cost',
  'quantity', 'unit', 'location', 'condition', 'custodian', 'notes'] as const;

export function listAssets(params?: { search?: string; category?: string }): Asset[] {
  const db = getDb();
  const cond: string[] = [];
  const vals: any[] = [];
  if (params?.search) {
    cond.push('(item_name LIKE ? OR description LIKE ? OR location LIKE ? OR custodian LIKE ?)');
    const q = `%${params.search}%`; vals.push(q, q, q, q);
  }
  if (params?.category && params.category !== 'all') { cond.push('category = ?'); vals.push(params.category); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM assets ${where} ORDER BY item_name ASC`).all(...vals) as Asset[];
}

export function getAssetById(id: number): Asset | undefined {
  return getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id) as Asset | undefined;
}

export function createAsset(data: Partial<Asset> & { item_name: string }): number {
  const db = getDb();
  const cols = FIELDS.filter((f) => (data as any)[f] !== undefined);
  const sql = `INSERT INTO assets (asset_uid, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`;
  const res = db.prepare(sql).run(uuidv4(), ...cols.map((c) => (data as any)[c] ?? null));
  return res.lastInsertRowid as number;
}

export function updateAsset(id: number, data: Partial<Asset>): void {
  const db = getDb();
  const set: string[] = []; const vals: any[] = [];
  for (const f of FIELDS) if ((data as any)[f] !== undefined) { set.push(`${f} = ?`); vals.push((data as any)[f]); }
  if (!set.length) return;
  set.push("updated_at = datetime('now')"); vals.push(id);
  db.prepare(`UPDATE assets SET ${set.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteAsset(id: number): void {
  getDb().prepare('DELETE FROM assets WHERE id = ?').run(id);
}
