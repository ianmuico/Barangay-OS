import { Router } from 'express';
import { listResidents, getResidentById } from '../../database/queries/residents';
import { listHouseholds } from '../../database/queries/households';

export const residentsRouter = Router();

residentsRouter.get('/residents', (req, res) => {
  const params = {
    search: req.query.search as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
    sortBy: req.query.sortBy as string,
    sortOrder: (req.query.sortOrder as string) === 'desc' ? 'desc' as const : 'asc' as const,
    is_senior: req.query.is_senior === 'true' ? true : undefined,
    is_indigent: req.query.is_indigent === 'true' ? true : undefined,
  };

  const result = listResidents(params);
  res.json(result);
});

residentsRouter.get('/residents/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const resident = getResidentById(id);
  if (!resident) {
    res.status(404).json({ error: 'Resident not found' });
    return;
  }
  res.json(resident);
});

residentsRouter.get('/households', (_req, res) => {
  const result = listHouseholds();
  res.json(result);
});
