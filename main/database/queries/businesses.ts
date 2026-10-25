import { getDb } from '../connection';

export interface Business {
  id: number;
  name: string;
  nature: string | null;
  address: string | null;
  purok: string | null;
  status: 'active' | 'closed';
  date_registered: string | null;
  permit_number: string | null;
  permit_issued_date: string | null;
  permit_expiry_date: string | null;
  permit_fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  owners?: BusinessOwner[];
  owner_names?: string;
  permit_state?: 'valid' | 'expiring' | 'expired' | null;
}

export interface BusinessOwner {
  id: number;
  business_id: number;
  resident_id: number | null;
  outside_owner_id: number | null;
  name?: string;
  is_outside?: number;
}

export interface OutsideOwner {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  gender: string | null;
  birth_date: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  business_names?: string;
}

export interface OwnerRef {
  resident_id?: number | null;
  outside_owner_id?: number | null;
}

const OWNER_NAME_SQL = `
  COALESCE(
    (SELECT GROUP_CONCAT(COALESCE(
        res.first_name || ' ' || res.last_name || COALESCE(' ' || res.suffix, ''),
        oo.first_name || ' ' || oo.last_name || COALESCE(' ' || oo.suffix, '')
      ), ', ')
      FROM business_owners bo
      LEFT JOIN residents res ON bo.resident_id = res.id
      LEFT JOIN outside_owners oo ON bo.outside_owner_id = oo.id
      WHERE bo.business_id = b.id), ''
  ) as owner_names`;

export function listBusinesses(params?: { search?: string; status?: string }): Business[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: any[] = [];
  if (params?.search) {
    conditions.push(`(b.name LIKE ? OR b.nature LIKE ? OR b.address LIKE ? OR EXISTS (
      SELECT 1 FROM business_owners bo
      LEFT JOIN residents res ON bo.resident_id = res.id
      LEFT JOIN outside_owners oo ON bo.outside_owner_id = oo.id
      WHERE bo.business_id = b.id AND (
        res.first_name || ' ' || res.last_name LIKE ? OR oo.first_name || ' ' || oo.last_name LIKE ?
      )))`);
    const q = `%${params.search}%`;
    values.push(q, q, q, q, q);
  }
  if (params?.status && params.status !== 'all') {
    conditions.push('b.status = ?');
    values.push(params.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT b.*, ${OWNER_NAME_SQL},
      CASE
        WHEN b.permit_expiry_date IS NULL OR b.permit_expiry_date = '' THEN NULL
        WHEN b.permit_expiry_date < date('now') THEN 'expired'
        WHEN b.permit_expiry_date <= date('now', '+30 days') THEN 'expiring'
        ELSE 'valid'
      END as permit_state
    FROM businesses b
    ${where}
    ORDER BY b.name ASC
  `).all(...values) as Business[];
}

export function getBusinessOwners(businessId: number): BusinessOwner[] {
  const db = getDb();
  return db.prepare(`
    SELECT bo.*,
      COALESCE(
        res.first_name || ' ' || res.last_name || COALESCE(' ' || res.suffix, ''),
        oo.first_name || ' ' || oo.last_name || COALESCE(' ' || oo.suffix, '')
      ) as name,
      CASE WHEN bo.outside_owner_id IS NOT NULL THEN 1 ELSE 0 END as is_outside
    FROM business_owners bo
    LEFT JOIN residents res ON bo.resident_id = res.id
    LEFT JOIN outside_owners oo ON bo.outside_owner_id = oo.id
    WHERE bo.business_id = ?
    ORDER BY bo.id ASC
  `).all(businessId) as BusinessOwner[];
}

export function createBusiness(data: Partial<Business> & { name: string }, owners: OwnerRef[]): number {
  const db = getDb();
  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO businesses (name, nature, address, purok, status, date_registered, notes,
        permit_number, permit_issued_date, permit_expiry_date, permit_fee)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.name, data.nature ?? null, data.address ?? null, data.purok ?? null,
      data.status || 'active', data.date_registered ?? null, data.notes ?? null,
      data.permit_number ?? null, data.permit_issued_date ?? null,
      data.permit_expiry_date ?? null, data.permit_fee ?? null);
    const id = result.lastInsertRowid as number;
    setOwnersInner(db, id, owners);
    return id;
  });
  return tx() as number;
}

export function updateBusiness(id: number, data: Partial<Business>, owners?: OwnerRef[]): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const fields: string[] = [];
    const values: any[] = [];
    for (const key of ['name', 'nature', 'address', 'purok', 'status', 'date_registered', 'notes',
      'permit_number', 'permit_issued_date', 'permit_expiry_date', 'permit_fee'] as const) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
    }
    if (fields.length) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE businesses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    if (owners) setOwnersInner(db, id, owners);
  });
  tx();
}

function setOwnersInner(db: ReturnType<typeof getDb>, businessId: number, owners: OwnerRef[]): void {
  db.prepare('DELETE FROM business_owners WHERE business_id = ?').run(businessId);
  const insert = db.prepare('INSERT INTO business_owners (business_id, resident_id, outside_owner_id) VALUES (?, ?, ?)');
  for (const o of owners) {
    if (!o.resident_id && !o.outside_owner_id) continue;
    insert.run(businessId, o.resident_id ?? null, o.outside_owner_id ?? null);
  }
}

export function deleteBusiness(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM businesses WHERE id = ?').run(id);
}

// ─── Outside owners ──────────────────────────────────────────────────────────

export function listOutsideOwners(search?: string): OutsideOwner[] {
  const db = getDb();
  const where = search ? 'WHERE o.first_name LIKE @q OR o.last_name LIKE @q OR o.address LIKE @q' : '';
  return db.prepare(`
    SELECT o.*,
      COALESCE((SELECT GROUP_CONCAT(b.name, ', ') FROM business_owners bo JOIN businesses b ON bo.business_id = b.id WHERE bo.outside_owner_id = o.id), '') as business_names
    FROM outside_owners o
    ${where}
    ORDER BY o.last_name ASC, o.first_name ASC
  `).all(search ? { q: `%${search}%` } : {}) as OutsideOwner[];
}

export function createOutsideOwner(data: Partial<OutsideOwner> & { first_name: string; last_name: string }): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO outside_owners (first_name, middle_name, last_name, suffix, gender, birth_date, address, contact_number, email, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.first_name, data.middle_name ?? null, data.last_name, data.suffix ?? null,
    data.gender ?? null, data.birth_date ?? null, data.address ?? null,
    data.contact_number ?? null, data.email ?? null, data.notes ?? null,
  );
  return result.lastInsertRowid as number;
}

export function updateOutsideOwner(id: number, data: Partial<OutsideOwner>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  for (const key of ['first_name', 'middle_name', 'last_name', 'suffix', 'gender', 'birth_date', 'address', 'contact_number', 'email', 'notes'] as const) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE outside_owners SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteOutsideOwner(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM outside_owners WHERE id = ?').run(id);
}
