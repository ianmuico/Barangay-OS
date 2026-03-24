import { getDb } from '../connection';

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'staff';
  full_name: string | null;
  avatar_path: string | null;
  preferences_json: string;
  created_at: string;
  updated_at: string;
}

export type SafeUser = Omit<User, 'password_hash'>;

export function listUsers(): SafeUser[] {
  const db = getDb();
  return db.prepare(
    'SELECT id, username, role, full_name, avatar_path, preferences_json, created_at, updated_at FROM users ORDER BY created_at DESC'
  ).all() as SafeUser[];
}

export function getUserById(id: number): User | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByUsername(username: string): User | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function createUser(data: {
  username: string;
  password_hash: string;
  role: string;
  full_name?: string;
}): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
  ).run(data.username, data.password_hash, data.role, data.full_name || null);
  return result.lastInsertRowid as number;
}

export function updateUser(id: number, data: {
  username?: string;
  role?: string;
  full_name?: string;
  avatar_path?: string;
  preferences_json?: string;
}): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username); }
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
  if (data.full_name !== undefined) { fields.push('full_name = ?'); values.push(data.full_name); }
  if (data.avatar_path !== undefined) { fields.push('avatar_path = ?'); values.push(data.avatar_path); }
  if (data.preferences_json !== undefined) { fields.push('preferences_json = ?'); values.push(data.preferences_json); }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function updatePassword(id: number, passwordHash: string): void {
  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, id);
}

export function deleteUser(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}
