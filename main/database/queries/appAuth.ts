import crypto from 'crypto';
import { getDb } from '../connection';
import { encryptSecret, decryptSecret } from '../../utils/secret';

// ─── Dynamic roles ───────────────────────────────────────────────────────────

export interface AppRole {
  id: number;
  name: string;
  perm_search: number;
  perm_read: number;
  perm_create: number;
  perm_delete: number;
  is_system: number;
  created_at: string;
}

export interface AppPermissions {
  search: boolean;
  read: boolean;
  create: boolean; // also governs edit/update
  delete: boolean;
}

export function listRoles(): AppRole[] {
  return getDb().prepare('SELECT * FROM app_roles ORDER BY is_system DESC, name ASC').all() as AppRole[];
}

export function createRole(name: string, perms: AppPermissions): number {
  const db = getDb();
  const r = db.prepare(
    'INSERT INTO app_roles (name, perm_search, perm_read, perm_create, perm_delete) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), perms.search ? 1 : 0, perms.read ? 1 : 0, perms.create ? 1 : 0, perms.delete ? 1 : 0);
  return r.lastInsertRowid as number;
}

export function updateRole(id: number, data: { name?: string; perms?: AppPermissions }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()); }
  if (data.perms) {
    fields.push('perm_search = ?', 'perm_read = ?', 'perm_create = ?', 'perm_delete = ?');
    values.push(data.perms.search ? 1 : 0, data.perms.read ? 1 : 0, data.perms.create ? 1 : 0, data.perms.delete ? 1 : 0);
  }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE app_roles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteRole(id: number): { success: boolean; error?: string } {
  const db = getDb();
  const role = db.prepare('SELECT is_system FROM app_roles WHERE id = ?').get(id) as { is_system: number } | undefined;
  if (!role) return { success: false, error: 'Role not found' };
  if (role.is_system) return { success: false, error: 'The Administrator role cannot be deleted.' };
  const inUse = (db.prepare('SELECT COUNT(*) n FROM app_users WHERE role_id = ?').get(id) as { n: number }).n;
  if (inUse > 0) return { success: false, error: `${inUse} user(s) still use this role. Reassign them first.` };
  db.prepare('DELETE FROM app_roles WHERE id = ?').run(id);
  return { success: true };
}

// ─── App users (reversibly-encrypted passwords) ──────────────────────────────

export interface AppUser {
  id: number;
  username: string;
  full_name: string | null;
  role_id: number | null;
  role_name?: string | null;
  is_active: number;
  created_at: string;
  last_login: string | null;
}

export function listAppUsers(): AppUser[] {
  return getDb().prepare(`
    SELECT u.id, u.username, u.full_name, u.role_id, r.name as role_name,
           u.is_active, u.created_at, u.last_login
    FROM app_users u LEFT JOIN app_roles r ON u.role_id = r.id
    ORDER BY u.username ASC
  `).all() as AppUser[];
}

export function createAppUser(data: { username: string; full_name?: string | null; password: string; role_id: number | null }): number {
  const db = getDb();
  const r = db.prepare(
    'INSERT INTO app_users (username, full_name, password_enc, role_id) VALUES (?, ?, ?, ?)'
  ).run(data.username.trim(), data.full_name?.trim() || null, encryptSecret(data.password), data.role_id ?? null);
  return r.lastInsertRowid as number;
}

export function updateAppUser(id: number, data: { username?: string; full_name?: string | null; password?: string; role_id?: number | null; is_active?: number }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username.trim()); }
  if (data.full_name !== undefined) { fields.push('full_name = ?'); values.push(data.full_name?.trim() || null); }
  if (data.password !== undefined && data.password) { fields.push('password_enc = ?'); values.push(encryptSecret(data.password)); }
  if (data.role_id !== undefined) { fields.push('role_id = ?'); values.push(data.role_id); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE app_users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteAppUser(id: number): void {
  getDb().prepare('DELETE FROM app_users WHERE id = ?').run(id);
}

// Admin-only password reveal (local-first)
export function revealAppUserPassword(id: number): string | null {
  const row = getDb().prepare('SELECT password_enc FROM app_users WHERE id = ?').get(id) as { password_enc: string } | undefined;
  return row ? decryptSecret(row.password_enc) : null;
}

// ─── Login + sessions (for the API) ──────────────────────────────────────────

interface Session { userId: number; username: string; name: string; roleName: string; perms: AppPermissions; expires: number; }
const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function rolePerms(roleId: number | null): AppPermissions {
  if (!roleId) return { search: false, read: false, create: false, delete: false };
  const r = getDb().prepare('SELECT perm_search, perm_read, perm_create, perm_delete FROM app_roles WHERE id = ?').get(roleId) as any;
  if (!r) return { search: false, read: false, create: false, delete: false };
  return { search: !!r.perm_search, read: !!r.perm_read, create: !!r.perm_create, delete: !!r.perm_delete };
}

export function appLogin(username: string, password: string): { token: string; user: { id: number; name: string; username: string; role: string | null; permissions: AppPermissions } } | { error: string } {
  const db = getDb();
  const u = db.prepare(`
    SELECT u.*, r.name as role_name FROM app_users u
    LEFT JOIN app_roles r ON u.role_id = r.id WHERE u.username = ?
  `).get(username.trim()) as any;
  if (!u) return { error: 'Invalid username or password' };
  if (!u.is_active) return { error: 'This account is disabled. Contact the barangay admin.' };
  if (decryptSecret(u.password_enc) !== password) return { error: 'Invalid username or password' };

  const perms = rolePerms(u.role_id);
  const token = crypto.randomBytes(24).toString('base64url');
  sessions.set(token, {
    userId: u.id, username: u.username, name: u.full_name || u.username,
    roleName: u.role_name || 'No role', perms, expires: Date.now() + SESSION_TTL_MS,
  });
  db.prepare("UPDATE app_users SET last_login = datetime('now') WHERE id = ?").run(u.id);
  return {
    token,
    user: { id: u.id, name: u.full_name || u.username, username: u.username, role: u.role_name || null, permissions: perms },
  };
}

export function resolveAppSession(token: string): Session | undefined {
  const s = sessions.get(token);
  if (!s) return undefined;
  if (Date.now() > s.expires) { sessions.delete(token); return undefined; }
  // Refresh perms live so role changes take effect without re-login
  const fresh = getDb().prepare(`
    SELECT r.name as role_name, r.perm_search, r.perm_read, r.perm_create, r.perm_delete, u.is_active, u.role_id
    FROM app_users u LEFT JOIN app_roles r ON u.role_id = r.id WHERE u.id = ?
  `).get(s.userId) as any;
  if (!fresh || !fresh.is_active) { sessions.delete(token); return undefined; }
  s.perms = { search: !!fresh.perm_search, read: !!fresh.perm_read, create: !!fresh.perm_create, delete: !!fresh.perm_delete };
  s.roleName = fresh.role_name || 'No role';
  return s;
}

export function endAppSession(token: string): void {
  sessions.delete(token);
}
