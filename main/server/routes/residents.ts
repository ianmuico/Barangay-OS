import { Router } from 'express';
import { listResidents, getResidentById, getResidentByUid, createResident, updateResident } from '../../database/queries/residents';
import { findExactDuplicate } from '../../database/queries/import';
import { listHouseholds } from '../../database/queries/households';
import { logAudit } from '../../database/queries/audit';
import { getRequester } from '../middleware/apiKeyAuth';
import { requirePerm } from '../middleware/appUser';
import { deleteResident } from '../../database/queries/residents';

export const residentsRouter = Router();

residentsRouter.get('/residents', (req, res) => {
  const searching = !!(req.query.search as string);
  if (!requirePerm(req, res, searching ? 'search' : 'read')) return;
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

// QR code resolution: the QR encodes the resident's permanent UID
residentsRouter.get('/residents/by-uid/:uid', (req, res) => {
  if (!requirePerm(req, res, 'read')) return;
  const resident = getResidentByUid(req.params.uid);
  if (!resident) {
    res.status(404).json({ error: 'Resident not found' });
    return;
  }
  res.json(resident);
});

residentsRouter.get('/residents/:id', (req, res) => {
  if (!requirePerm(req, res, 'read')) return;
  const id = parseInt(req.params.id);
  const resident = getResidentById(id);
  if (!resident) {
    res.status(404).json({ error: 'Resident not found' });
    return;
  }
  res.json(resident);
});

// ─── Write endpoints for the mobile partner app ──────────────────────────────
// Gated by the API key like everything else. Deletion is intentionally NOT
// exposed over the network — that stays a desktop admin action.

const REQUIRED_FIELDS = ['first_name', 'last_name', 'birth_date', 'gender', 'civil_status'] as const;
const WRITABLE_FIELDS = [
  'first_name', 'middle_name', 'last_name', 'suffix', 'birth_date', 'gender',
  'civil_status', 'address', 'purok', 'contact_number', 'email', 'occupation',
  'is_indigent', 'voter_status', 'blood_type', 'religion', 'citizenship',
  'philsys_card_no', 'educational_attainment', 'is_4ps', 'status', 'notes',
] as const;

function pickWritable(body: any): Record<string, any> {
  const data: Record<string, any> = {};
  for (const field of WRITABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  return data;
}

residentsRouter.post('/residents', (req, res) => {
  if (!requirePerm(req, res, 'create')) return;
  const body = req.body || {};
  const missing = REQUIRED_FIELDS.filter(f => !body[f]);
  if (missing.length) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    return;
  }
  // Duplicate guard — caller can resend with force:true to confirm a real twin.
  if (!body.force) {
    const dup = findExactDuplicate(body.first_name, body.last_name, body.birth_date);
    if (dup) {
      res.status(409).json({ error: 'A resident with this name and birth date already exists.', existing: dup });
      return;
    }
  }
  try {
    const requester = getRequester(req);
    const id = createResident({
      ...pickWritable(body),
      created_via: 'mobile',
      created_by_client: requester.admin ? null : requester.clientId,
    } as any);
    logAudit(null, 'RESIDENT_CREATED', `Created via mobile API${requester.clientName ? ` (${requester.clientName})` : ''}: ${body.first_name} ${body.last_name}`);
    const resident = getResidentById(id);
    res.status(201).json(resident);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create resident' });
  }
});

residentsRouter.put('/residents/:id', (req, res) => {
  if (!requirePerm(req, res, 'create')) return;
  const id = parseInt(req.params.id);
  const existing = getResidentById(id);
  if (!existing) {
    res.status(404).json({ error: 'Resident not found' });
    return;
  }
  // Per-device clients may only edit records they themselves created.
  const requester = getRequester(req);
  if (!requester.admin && (existing as any).created_by_client !== requester.clientId) {
    res.status(403).json({ error: 'You can only edit residents that were added from this device/account.' });
    return;
  }
  const data = pickWritable(req.body || {});
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'No writable fields provided' });
    return;
  }
  // Optimistic concurrency: clients send the row_version they last read.
  const expectedVersion = req.body?.row_version;
  try {
    const result = updateResident(id, data as any, typeof expectedVersion === 'number' ? expectedVersion : undefined);
    if (result.conflict) {
      res.status(409).json({ error: 'This record was changed by someone else. Reload before editing.', current: result.current });
      return;
    }
    logAudit(null, 'RESIDENT_UPDATED', `Updated via mobile API${requester.clientName ? ` (${requester.clientName})` : ''}: ${existing.first_name} ${existing.last_name}`);
    res.json(getResidentById(id));
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to update resident' });
  }
});

residentsRouter.delete('/residents/:id', (req, res) => {
  if (!requirePerm(req, res, 'delete')) return;
  const id = parseInt(req.params.id);
  const existing = getResidentById(id);
  if (!existing) {
    res.status(404).json({ error: 'Resident not found' });
    return;
  }
  try {
    deleteResident(id);
    logAudit(null, 'RESIDENT_DELETED', `Deleted via mobile API: ${existing.first_name} ${existing.last_name}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to delete resident' });
  }
});

residentsRouter.get('/households', (_req, res) => {
  const result = listHouseholds();
  res.json(result);
});
