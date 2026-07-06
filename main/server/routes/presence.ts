import { Router } from 'express';
import { heartbeat, listAll } from '../../ipc/presence';
import { getRequester } from '../middleware/apiKeyAuth';

export const presenceRouter = Router();

// Mobile heartbeat: body { entity, id, action, sessionId } → returns other live actors
presenceRouter.post('/presence', (req, res) => {
  const { entity, id, action, sessionId, label } = req.body || {};
  if (!entity || id === undefined || !sessionId) {
    res.status(400).json({ error: 'entity, id and sessionId are required' });
    return;
  }
  const who = getRequester(req).clientName || 'Mobile user';
  const others = heartbeat({ entity, id: String(id), action: action || 'editing', who, sessionId, label });
  res.json({ others });
});

presenceRouter.get('/presence', (_req, res) => {
  res.json({ active: listAll() });
});
