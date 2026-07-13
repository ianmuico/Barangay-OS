import { getDb } from '../connection';

// RBI Form C — semestral demographic/sectoral summary counts.
// Returns a flat map so the report template can use {{count:key}} variables.
export function getRbiFormCCounts(): Record<string, number> {
  const db = getDb();
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const living = "status = 'living'";
  const age = "CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER)";
  return {
    total: n(`SELECT COUNT(*) n FROM residents WHERE ${living}`),
    male: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND gender='Male'`),
    female: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND gender='Female'`),
    households: n(`SELECT COUNT(*) n FROM households`),
    children: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND ${age} BETWEEN 0 AND 14`),
    youth: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND ${age} BETWEEN 15 AND 30`),
    adults: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND ${age} BETWEEN 31 AND 59`),
    seniors: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND ${age} >= 60`),
    seniorsMale: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND gender='Male' AND ${age} >= 60`),
    seniorsFemale: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND gender='Female' AND ${age} >= 60`),
    pwd: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND is_pwd=1`),
    soloParents: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND is_solo_parent=1`),
    osy: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND is_osy=1`),
    ofw: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND is_ofw=1`),
    ip: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND is_ip=1`),
    indigent: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND is_indigent=1`),
    fourps: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND is_4ps=1`),
    voters: n(`SELECT COUNT(*) n FROM residents WHERE ${living} AND voter_status='Registered'`),
  };
}
