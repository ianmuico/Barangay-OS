import crypto from 'crypto';
import { getDb } from '../connection';

// Per-device API clients for the mobile partner app. Each device/account gets
// its own high-entropy token; we store only a SHA-256 hash. Tokens are random
// enough that an unsalted hash with an indexed exact-match lookup is safe.

export interface ApiClient {
  id: number;
  name: string;
  is_active: number;
  created_at: string;
  last_seen: string | null;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function listApiClients(): ApiClient[] {
  const db = getDb();
  return db.prepare(
    'SELECT id, name, is_active, created_at, last_seen FROM api_clients ORDER BY created_at DESC'
  ).all() as ApiClient[];
}

// Returns the one-time plaintext token (shown once) plus the new client id.
export function createApiClient(name: string): { id: number; token: string } {
  const db = getDb();
  const token = 'bmc_' + crypto.randomBytes(24).toString('base64url'); // barangay mobile client
  const result = db.prepare(
    'INSERT INTO api_clients (name, token_hash) VALUES (?, ?)'
  ).run(name.trim() || 'Mobile device', hashToken(token));
  return { id: result.lastInsertRowid as number, token };
}

export function setApiClientActive(id: number, active: boolean): void {
  const db = getDb();
  db.prepare('UPDATE api_clients SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function deleteApiClient(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM api_clients WHERE id = ?').run(id);
}

// Resolve a presented token to an active client (or undefined). Touches last_seen.
export function resolveApiClient(token: string): { id: number; name: string } | undefined {
  if (!token) return undefined;
  const db = getDb();
  const row = db.prepare(
    'SELECT id, name FROM api_clients WHERE token_hash = ? AND is_active = 1'
  ).get(hashToken(token)) as { id: number; name: string } | undefined;
  if (row) {
    db.prepare("UPDATE api_clients SET last_seen = datetime('now') WHERE id = ?").run(row.id);
  }
  return row;
}
