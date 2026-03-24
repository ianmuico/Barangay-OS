import { getDb } from '../connection';

export interface AuditEntry {
  id: number;
  user_id: number | null;
  action: string;
  details: string | null;
  created_at: string;
  username?: string;
}

export function logAudit(userId: number | null, action: string, details?: string): void {
  const db = getDb();
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(userId, action, details || null);
}

export function getAuditLog(limit: number = 50): AuditEntry[] {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, u.username
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit) as AuditEntry[];
}
