import { ipcMain } from 'electron';
import { getUserByUsername, type SafeUser } from '../database/queries/users';
import { verifyPasswordSync } from '../utils/hash';
import { logAudit } from '../database/queries/audit';

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
