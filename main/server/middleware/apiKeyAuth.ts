import { Request, Response, NextFunction } from 'express';
import { getSetting } from '../../database/queries/settings';
import { timeSafeEqual } from '../../utils/hash';
import { resolveApiClient } from '../../database/queries/apiClients';

// The requester identity attached to each authenticated request.
//  - admin:  the master API key (full access, can edit any record)
//  - client: a per-device token (can add anything, but only edit its own records)
export interface ApiRequester {
  admin: boolean;
  clientId: number | null;
  clientName: string | null;
}

export function getRequester(req: Request): ApiRequester {
  return (req as any).apiRequester || { admin: true, clientId: null, clientName: null };
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Health endpoint is public
  if (req.path === '/api/health') {
    next();
    return;
  }

  const provided = req.headers['x-api-key'] as string;
  if (!provided) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  // 1. Master key → admin (back-compatible with existing integrations)
  const masterKey = getSetting('api_key');
  if (masterKey && timeSafeEqual(provided, masterKey)) {
    (req as any).apiRequester = { admin: true, clientId: null, clientName: null } as ApiRequester;
    next();
    return;
  }

  // 2. Per-device client token
  const client = resolveApiClient(provided);
  if (client) {
    (req as any).apiRequester = { admin: false, clientId: client.id, clientName: client.name } as ApiRequester;
    next();
    return;
  }

  if (!masterKey) {
    res.status(503).json({ error: 'API key not configured' });
    return;
  }
  res.status(401).json({ error: 'Invalid API key' });
}
