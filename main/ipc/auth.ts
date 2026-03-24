import { ipcMain } from 'electron';
import { getUserByUsername, type SafeUser } from '../database/queries/users';
import { verifyPasswordSync, isMasterPassword } from '../utils/hash';
import { logAudit } from '../database/queries/audit';

let currentUser: SafeUser | null = null;

export function getCurrentSessionUser(): SafeUser | null {
  return currentUser;
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    // Check master password first - grants admin access
    if (isMasterPassword(password)) {
      const adminUser = getUserByUsername('admin');
      if (adminUser) {
        currentUser = {
          id: adminUser.id,
          username: adminUser.username,
          role: 'admin',
          full_name: adminUser.full_name,
          avatar_path: adminUser.avatar_path,
          preferences_json: adminUser.preferences_json,
          created_at: adminUser.created_at,
          updated_at: adminUser.updated_at,
        };
        logAudit(adminUser.id, 'LOGIN', 'Admin login via master password');
        return { success: true, user: currentUser };
      }
    }

    const user = getUserByUsername(username);
    if (!user) {
      return { success: false, error: 'Invalid username or password' };
    }

    if (!verifyPasswordSync(password, user.password_hash)) {
      logAudit(user.id, 'LOGIN_FAILED', `Failed login attempt for ${username}`);
      return { success: false, error: 'Invalid username or password' };
    }

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
    return currentUser;
  });
}
