import { Router } from 'express';
import { listOfficials } from '../../database/queries/officials';

export const officialsRouter = Router();

// Read-only list of barangay officials. ?active=true returns current officials only.
officialsRouter.get('/officials', (req, res) => {
  const activeOnly = req.query.active === 'true';
  const officials = listOfficials()
    .filter(o => !activeOnly || o.is_active)
    .map(o => ({
      id: o.id,
      position: o.position,
      name: [o.first_name, o.middle_name, o.last_name, o.suffix].filter(Boolean).join(' ') || null,
      is_active: !!o.is_active,
      start_date: o.start_date,
      end_date: o.end_date,
      sort_order: o.sort_order,
    }));
  res.json({ data: officials, total: officials.length });
});
