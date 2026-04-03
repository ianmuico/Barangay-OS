import { Request, Response, NextFunction } from 'express';
import { getSetting } from '../../database/queries/settings';
import { timeSafeEqual } from '../../utils/hash';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Health endpoint is public
  if (req.path === '/api/health') {
    next();
    return;
  }

  const apiKey = getSetting('api_key');
  if (!apiKey) {
    res.status(503).json({ error: 'API key not configured' });
    return;
  }

  const providedKey = req.headers['x-api-key'] as string;
  if (!providedKey || !timeSafeEqual(providedKey, apiKey)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
