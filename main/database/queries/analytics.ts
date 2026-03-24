import { getDb } from '../connection';

export interface AnalyticsEvent {
  id: number;
  event_type: string;
  event_data: string | null;
  created_at: string;
}

export interface AnalyticsSummary {
  totalAppOpens: number;
  totalCertificatesGenerated: number;
  totalResidentsAdded: number;
  totalImports: number;
  eventsByType: { event_type: string; count: number }[];
  recentEvents: AnalyticsEvent[];
}

export function trackEvent(eventType: string, eventData?: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO analytics_events (event_type, event_data) VALUES (?, ?)'
  ).run(eventType, eventData || null);
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const db = getDb();

  const totalAppOpens = (db.prepare(
    "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'app_open'"
  ).get() as { count: number }).count;

  const totalCertificatesGenerated = (db.prepare(
    "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'certificate_generated'"
  ).get() as { count: number }).count;

  const totalResidentsAdded = (db.prepare(
    "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'resident_added'"
  ).get() as { count: number }).count;

  const totalImports = (db.prepare(
    "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'csv_imported'"
  ).get() as { count: number }).count;

  const eventsByType = db.prepare(
    'SELECT event_type, COUNT(*) as count FROM analytics_events GROUP BY event_type ORDER BY count DESC'
  ).all() as { event_type: string; count: number }[];

  const recentEvents = db.prepare(
    'SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT 50'
  ).all() as AnalyticsEvent[];

  return {
    totalAppOpens,
    totalCertificatesGenerated,
    totalResidentsAdded,
    totalImports,
    eventsByType,
    recentEvents,
  };
}

export function exportAnalytics(): string {
  const db = getDb();
  const events = db.prepare(
    'SELECT * FROM analytics_events ORDER BY created_at DESC'
  ).all() as AnalyticsEvent[];

  if (events.length === 0) return '';

  const headers = 'id,event_type,event_data,created_at';
  const rows = events.map(e => {
    const data = e.event_data ? `"${e.event_data.replace(/"/g, '""')}"` : '';
    return `${e.id},${e.event_type},${data},${e.created_at}`;
  });

  return [headers, ...rows].join('\n');
}
