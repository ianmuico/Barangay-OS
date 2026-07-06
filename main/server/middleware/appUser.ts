import { Request, Response, NextFunction } from 'express';
import { resolveAppSession } from '../../database/queries/appAuth';
import type { AppPermissions } from '../../database/queries/appAuth';

// Resolves an optional X-User-Token into the logged-in app user + permissions.
// Runs after apiKeyAuth (device/master key). If no token, requests proceed as
// before (master-key admin behaviour); if a token is present it must be valid.
export interface AppUserContext {
  userId: number;
  name: string;
  roleName: string;
  perms: AppPermissions;
}

export function getAppUser(req: Request): AppUserContext | null {
  return (req as any).appUser || null;
}

export function appUserAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-user-token'] as string | undefined;
  if (!token) { next(); return; } // anonymous (master-key) access still allowed
  const session = resolveAppSession(token);
  if (!session) {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    return;
  }
  (req as any).appUser = {
    userId: session.userId, name: session.name, roleName: session.roleName, perms: session.perms,
  } as AppUserContext;
  next();
}

// Enforce a permission for the logged-in app user. Master-key/anonymous callers
// (no user token) are treated as admin and pass through.
export function requirePerm(req: Request, res: Response, perm: keyof AppPermissions): boolean {
  const user = getAppUser(req);
  if (!user) return true; // master key / no user session → full access
  if (user.perms[perm]) return true;
  res.status(403).json({ error: `Your role does not have permission to ${perm} residents.` });
  return false;
}
