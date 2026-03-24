import { Router } from 'express';
import { getSetting } from '../../database/queries/settings';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    barangay: getSetting('barangay_name') || 'Barangay',
    timestamp: new Date().toISOString(),
  });
});
