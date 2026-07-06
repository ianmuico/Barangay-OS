import { Router } from 'express';
import { appLogin, endAppSession, resolveAppSession } from '../../database/queries/appAuth';
import { getSetting } from '../../database/queries/settings';
import { logAudit } from '../../database/queries/audit';

export const appAuthRouter = Router();

function onlineEnabled(): boolean {
  return getSetting('online_enabled') !== '0';
}

// User login for the mobile app. Device key (X-API-Key) is already verified by
// apiKeyAuth; this authenticates the human user and returns their permissions.
appAuthRouter.post('/app/login', (req, res) => {
  if (!onlineEnabled()) {
    res.status(503).json({ error: 'Online access is currently disabled by the barangay office.' });
    return;
  }
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  const result = appLogin(username, password);
  if ('error' in result) {
    logAudit(null, 'APP_LOGIN_FAILED', `Failed mobile login for "${username}"`);
    res.status(401).json(result);
    return;
  }
  logAudit(null, 'APP_LOGIN', `Mobile login: ${result.user.username} (${result.user.role || 'no role'})`);
  res.json(result);
});

appAuthRouter.post('/app/logout', (req, res) => {
  const token = req.headers['x-user-token'] as string | undefined;
  if (token) endAppSession(token);
  res.json({ success: true });
});

// Re-fetch the current user + (live) permissions — used on app resume.
appAuthRouter.get('/app/me', (req, res) => {
  const token = req.headers['x-user-token'] as string | undefined;
  const session = token ? resolveAppSession(token) : undefined;
  if (!session) { res.status(401).json({ error: 'Not logged in' }); return; }
  res.json({
    user: {
      id: session.userId, name: session.name, username: session.username,
      role: session.roleName, permissions: session.perms,
    },
  });
});
