import { Router } from 'express';
import { getDb } from '../../database/connection';
import { getSetting } from '../../database/queries/settings';

export const statsRouter = Router();

// Read-only demographic summary for dashboards and external apps.
statsRouter.get('/stats', (_req, res) => {
  const db = getDb();
  const count = (sql: string): number =>
    (db.prepare(sql).get() as { n: number }).n;

  res.json({
    barangay: getSetting('barangay_name') || null,
    municipality: getSetting('municipality') || null,
    province: getSetting('province') || null,
    residents: {
      total: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased'"),
      seniors: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND birth_date <= date('now', '-60 years')"),
      youth: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND birth_date <= date('now', '-15 years') AND birth_date > date('now', '-31 years')"),
      indigents: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND is_indigent = 1"),
      fourPs: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND is_4ps = 1"),
      pwd: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND is_pwd = 1"),
      deceased: count("SELECT COUNT(*) n FROM residents WHERE status = 'deceased'"),
      male: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND LOWER(gender) = 'male'"),
      female: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND LOWER(gender) = 'female'"),
    },
    households: count('SELECT COUNT(*) n FROM households'),
    cases: {
      total: count('SELECT COUNT(*) n FROM cases'),
      pending: count("SELECT COUNT(*) n FROM cases WHERE status = 'pending'"),
      ongoing: count("SELECT COUNT(*) n FROM cases WHERE status = 'ongoing'"),
      resolved: count("SELECT COUNT(*) n FROM cases WHERE status = 'resolved'"),
    },
    generatedAt: new Date().toISOString(),
  });
});
