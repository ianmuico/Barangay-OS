import { ipcMain } from 'electron';
import crypto from 'crypto';
import { getUserByUsername, updatePassword, type SafeUser } from '../database/queries/users';
import { verifyPasswordSync, hashPasswordSync } from '../utils/hash';
import { logAudit } from '../database/queries/audit';
import { getSetting, setSetting } from '../database/queries/settings';

let currentUser: SafeUser | null = null;
let lastActivity: number = Date.now();

// Rate limiting: track failed login attempts
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Session timeout: 30 minutes idle
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export function getCurrentSessionUser(): SafeUser | null {
  if (!currentUser) return null;

  // Check session timeout
  if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
    logAudit(currentUser.id, 'SESSION_EXPIRED', `Session expired for ${currentUser.username}`);
    currentUser = null;
    return null;
  }

  lastActivity = Date.now();
  return currentUser;
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    // Rate limit check
    const attempts = loginAttempts.get(username);
    if (attempts && attempts.lockedUntil > Date.now()) {
      const remainingSec = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
      return { success: false, error: `Account locked. Try again in ${Math.ceil(remainingSec / 60)} minute(s).` };
    }

    const user = getUserByUsername(username);
    if (!user) {
      recordFailedAttempt(username);
      return { success: false, error: 'Invalid username or password' };
    }

    if (!verifyPasswordSync(password, user.password_hash)) {
      logAudit(user.id, 'LOGIN_FAILED', `Failed login attempt for ${username}`);
      recordFailedAttempt(username);
      return { success: false, error: 'Invalid username or password' };
    }

    // Successful login — clear attempts
    loginAttempts.delete(username);

    currentUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      avatar_path: user.avatar_path,
      preferences_json: user.preferences_json,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    lastActivity = Date.now();
    logAudit(user.id, 'LOGIN', `User ${username} logged in`);

    // Check if using default password — force change
    const isDefaultPassword = verifyPasswordSync('admin123', user.password_hash);
    return { success: true, user: currentUser, mustChangePassword: isDefaultPassword };
  });

  // ─── Forgotten-password recovery via one-time codes ──────────────────────
  // The admin generates codes while logged in, prints them, and keeps them in
  // the barangay safe. Each code resets ONE account's password, once.
  const recoveryAttempts = { count: 0, lockedUntil: 0 };

  ipcMain.handle('auth:generateRecoveryCodes', async () => {
    const user = getCurrentSessionUser();
    if (!user || user.role !== 'admin') return { success: false, error: 'Admin access required' };

    // 6 codes, unambiguous charset (no 0/O/1/I), format XXXXX-XXXXX
    const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const makeCode = () => {
      let raw = '';
      const bytes = crypto.randomBytes(10);
      for (let i = 0; i < 10; i++) raw += charset[bytes[i] % charset.length];
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    };
    const codes = Array.from({ length: 6 }, makeCode);
    setSetting('recovery_code_hashes', JSON.stringify(codes.map(c => hashPasswordSync(c))));
    logAudit(user.id, 'RECOVERY_CODES_GENERATED', 'New recovery codes generated (old codes invalidated)');
    return { success: true, codes };
  });

  ipcMain.handle('auth:recoveryStatus', async () => {
    try {
      const raw = getSetting('recovery_code_hashes');
      const hashes = raw ? JSON.parse(raw) : [];
      return { remaining: Array.isArray(hashes) ? hashes.length : 0 };
    } catch {
      return { remaining: 0 };
    }
  });

  ipcMain.handle('auth:recoveryReset', async (_event, username: string, code: string, newPassword: string) => {
    // Rate limit: 5 attempts then 15-minute lockout (codes are high-entropy,
    // this just makes brute force pointless)
    if (recoveryAttempts.lockedUntil > Date.now()) {
      return { success: false, error: 'Too many attempts. Try again in 15 minutes.' };
    }
    const fail = (message: string) => {
      recoveryAttempts.count++;
      if (recoveryAttempts.count >= 5) {
        recoveryAttempts.count = 0;
        recoveryAttempts.lockedUntil = Date.now() + 15 * 60 * 1000;
      }
      logAudit(null, 'RECOVERY_RESET_FAILED', `Failed recovery attempt for "${username}"`);
      return { success: false, error: message };
    };

    if (!username || !code || !newPassword) return fail('All fields are required');
    if (newPassword.length < 6) return { success: false, error: 'New password must be at least 6 characters' };

    const user = getUserByUsername(username.trim());
    if (!user) return fail('Invalid username or recovery code');

    let hashes: string[] = [];
    try { hashes = JSON.parse(getSetting('recovery_code_hashes') || '[]'); } catch { hashes = []; }
    const normalized = code.trim().toUpperCase();
    const matchIndex = hashes.findIndex(h => verifyPasswordSync(normalized, h));
    if (matchIndex === -1) return fail('Invalid username or recovery code');

    // Consume the code (single-use) and set the new password
    hashes.splice(matchIndex, 1);
    setSetting('recovery_code_hashes', JSON.stringify(hashes));
    updatePassword(user.id, hashPasswordSync(newPassword));
    recoveryAttempts.count = 0;
    logAudit(user.id, 'RECOVERY_RESET', `Password reset for "${user.username}" using a recovery code (${hashes.length} codes remaining)`);
    return { success: true, remaining: hashes.length };
  });

  ipcMain.handle('auth:logout', async () => {
    if (currentUser) {
      logAudit(currentUser.id, 'LOGOUT', `User ${currentUser.username} logged out`);
    }
    currentUser = null;
    return { success: true };
  });

  ipcMain.handle('auth:getCurrentUser', async () => {
    // Check session timeout on every poll
    if (currentUser && Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
      logAudit(currentUser.id, 'SESSION_EXPIRED', `Session expired for ${currentUser.username}`);
      currentUser = null;
      return null;
    }
    return currentUser;
  });
}

function recordFailedAttempt(username: string): void {
  const existing = loginAttempts.get(username);
  const count = (existing?.count || 0) + 1;

  if (count >= MAX_ATTEMPTS) {
    loginAttempts.set(username, { count, lockedUntil: Date.now() + LOCKOUT_MS });
  } else {
    loginAttempts.set(username, { count, lockedUntil: 0 });
  }
}
