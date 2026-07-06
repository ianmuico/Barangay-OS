'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Users, UserCheck, HeartHandshake, Baby, TrendingUp, FileText, Home, Scale, Vote, Banknote, HeartPulse, CalendarClock, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SummaryReportDialog } from '@/components/summary-report-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DashboardSkeleton } from '@/components/skeletons';
import { getAPI, type DashboardStats, type DetailedStats, type AuditEntry, type PresenceEntry } from '@/lib/ipc';
import { cachedFetch } from '@/lib/cache';
import { EmptyState } from '@/components/empty-state';
import { useTranslation } from 'react-i18next';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ─── Demographic color palette ────────────────────────────────────────
const DEMO_COLORS = {
  seniors: '#3b82f6',   // blue-500
  indigents: '#f59e0b', // amber-500
  youth: '#10b981',     // emerald-500
  residents: '#8b5cf6', // violet-500
  male: '#6366f1',      // indigo-500
  female: '#ec4899',    // pink-500
};

const PIE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316',
  '#ef4444', '#84cc16',
];

const ACTION_DOTS: Record<string, string> = {
  RESIDENT_CREATED: 'bg-emerald-500',
  RESIDENT_UPDATED: 'bg-blue-500',
  RESIDENT_DELETED: 'bg-red-500',
  REPORT_GENERATED: 'bg-purple-500',
  LOGIN: 'bg-amber-500',
  LOGOUT: 'bg-gray-400',
  BACKUP_CREATED: 'bg-teal-500',
  BACKUP_RESTORED: 'bg-orange-500',
  USER_CREATED: 'bg-sky-500',
  USER_UPDATED: 'bg-sky-400',
  OFFICIAL_CREATED: 'bg-indigo-500',
  TEMPLATE_CREATED: 'bg-violet-500',
};

const ACTION_LABELS: Record<string, string> = {
  RESIDENT_CREATED: 'Created',
  RESIDENT_UPDATED: 'Updated',
  RESIDENT_DELETED: 'Deleted',
  REPORT_GENERATED: 'Report',
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  BACKUP_CREATED: 'Backup',
  BACKUP_RESTORED: 'Restored',
  USER_CREATED: 'User Added',
  USER_UPDATED: 'User Edit',
  OFFICIAL_CREATED: 'Official',
  TEMPLATE_CREATED: 'Template',
};

type ChartView = 'overview' | 'seniors' | 'indigents' | 'youth';
type SubFilter = 'age' | 'occupation' | 'purok' | 'gender' | 'ageBracket';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const CustomTooltip = React.memo(function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md text-xs">
      <p className="font-medium">{d.name}</p>
      <p className="text-muted-foreground">{d.value.toLocaleString()} residents</p>
    </div>
  );
});

export default function DashboardPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [detailed, setDetailed] = useState<DetailedStats | null>(null);
  const [activities, setActivities] = useState<AuditEntry[]>([]);
  const [barangayName, setBarangayName] = useState('');
  const [chartView, setChartView] = useState<ChartView>('overview');
  const [subFilter, setSubFilter] = useState<SubFilter>('age');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    cachedFetch('dashboard:stats', () => api.getDashboardStats()).then(setStats);
    cachedFetch('dashboard:detailed', () => api.getDetailedStats()).then(setDetailed);
    cachedFetch('dashboard:activities', () => api.getAuditLog(50)).then(setActivities);
    api.getSetting('barangay_name').then((v) => setBarangayName(v || 'Barangay'));

    // Live "who's working on what" — poll every 8s
    const pollPresence = () => { (api as any).presenceList?.().then((p: PresenceEntry[]) => setPresence(p || [])).catch(() => {}); };
    pollPresence();
    const presenceTimer = setInterval(pollPresence, 8000);
    return () => clearInterval(presenceTimer);
  }, []);

  // Compute chart data based on active view/filter
  const chartData = useMemo(() => {
    if (!detailed || !stats) return [];

    if (chartView === 'overview') {
      return [
        { name: 'Senior Citizens', value: stats.totalSeniors, fill: DEMO_COLORS.seniors },
        { name: 'Indigents', value: stats.totalIndigents, fill: DEMO_COLORS.indigents },
        { name: 'Youth', value: stats.totalYouth, fill: DEMO_COLORS.youth },
        {
          name: 'Other Adults',
          value: Math.max(0, stats.totalResidents - stats.totalSeniors - stats.totalYouth),
          fill: DEMO_COLORS.residents,
        },
      ].filter(d => d.value > 0);
    }

    if (chartView === 'seniors') {
      if (subFilter === 'ageBracket') {
        return detailed.seniorAgeBrackets.map((d, i) => ({
          name: d.bracket,
          value: d.count,
          fill: PIE_PALETTE[i % PIE_PALETTE.length],
        }));
      }
      // Gender of seniors — use age distribution to approximate, or fall back to full gender
      return detailed.genderDistribution.map((d, i) => ({
        name: d.gender,
        value: d.count,
        fill: d.gender === 'Male' ? DEMO_COLORS.male : DEMO_COLORS.female,
      }));
    }

    if (chartView === 'indigents') {
      return detailed.indigentsByPurok.map((d, i) => ({
        name: `Purok ${d.purok}`,
        value: d.count,
        fill: PIE_PALETTE[i % PIE_PALETTE.length],
      }));
    }

    if (chartView === 'youth') {
      if (subFilter === 'occupation') {
        return detailed.youthByOccupation.map((d, i) => ({
          name: d.category,
          value: d.count,
          fill: PIE_PALETTE[i % PIE_PALETTE.length],
        }));
      }
      return detailed.youthByAge.map((d, i) => ({
        name: d.category,
        value: d.count,
        fill: PIE_PALETTE[i % PIE_PALETTE.length],
      }));
    }

    return [];
  }, [chartView, subFilter, detailed, stats]);

  // Which sub-filters to show for each view
  const subFilters = useMemo(() => {
    if (chartView === 'seniors') return [
      { key: 'ageBracket' as SubFilter, label: 'Age Bracket' },
      { key: 'gender' as SubFilter, label: 'Gender' },
    ];
    if (chartView === 'indigents') return [
      { key: 'purok' as SubFilter, label: 'By Purok' },
    ];
    if (chartView === 'youth') return [
      { key: 'age' as SubFilter, label: 'Age Bracket' },
      { key: 'occupation' as SubFilter, label: 'Occupation' },
    ];
    return [];
  }, [chartView]);

  // Reset sub-filter when view changes
  useEffect(() => {
    if (chartView === 'seniors') setSubFilter('ageBracket');
    else if (chartView === 'indigents') setSubFilter('purok');
    else if (chartView === 'youth') setSubFilter('age');
  }, [chartView]);

  if (stats === null) {
    return <DashboardSkeleton />;
  }

  if (stats.totalResidents === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('dashboard.title')} description={t('dashboard.description', { barangayName: barangayName || 'Barangay' })} />
        <Card>
          <CardContent className="p-0">
            <EmptyState
              illustration="dashboard"
              title={t('empty.dashboardTitle')}
              message={t('empty.dashboardMessage')}
              primaryAction={{
                label: t('empty.dashboardCta'),
                onClick: () => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/residents';
                  }
                },
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    { title: 'Total Residents', value: stats.totalResidents, icon: Users, desc: 'All registered residents', color: DEMO_COLORS.residents, view: 'overview' as ChartView },
    { title: 'Senior Citizens', value: stats.totalSeniors, icon: UserCheck, desc: '60 years old and above', color: DEMO_COLORS.seniors, view: 'seniors' as ChartView },
    { title: 'Indigent', value: stats.totalIndigents, icon: HeartHandshake, desc: 'Flagged as indigent', color: DEMO_COLORS.indigents, view: 'indigents' as ChartView },
    { title: 'Youth', value: stats.totalYouth, icon: Baby, desc: '15-30, unmarried', color: DEMO_COLORS.youth, view: 'youth' as ChartView },
  ];

  const totalInChart = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Dashboard" description={`${barangayName} Management System overview and analytics`} />
        <Button variant="outline" onClick={() => setSummaryOpen(true)}>
          <FileText className="mr-2 h-4 w-4" />
          Summary Report
        </Button>
      </div>

      {/* Stat Cards — clickable to switch chart view */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const isActive = chartView === stat.view;
          return (
            <Card
              key={stat.title}
              className={`cursor-pointer transition-all ${isActive ? 'ring-2 ring-offset-2 ring-offset-background' : 'hover:shadow-md'}`}
              style={isActive ? { borderColor: stat.color, ringColor: stat.color, '--tw-ring-color': stat.color } as any : {}}
              onClick={() => setChartView(stat.view)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">{stat.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Live activity — who is adding/editing records right now */}
      {presence.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-900 dark:bg-blue-950/30">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            <Eye className="h-3.5 w-3.5" /> Active now
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {presence.map((p) => (
              <span key={p.sessionId} className="text-foreground">
                <span className="font-medium">{p.who}</span>
                <span className="text-muted-foreground"> is {p.action} </span>
                <span className="font-medium">{p.label || `${p.entity} #${p.id}`}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Secondary stats — quick links to other modules */}
      {detailed && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: '4Ps Beneficiaries', value: stats.total4Ps, icon: Banknote, color: '#f97316', href: '/four-ps' },
            { label: 'Households', value: detailed.householdCount ?? 0, icon: Home, color: '#14b8a6', href: null },
            { label: 'Active Cases', value: (detailed.caseStats?.pending ?? 0) + (detailed.caseStats?.ongoing ?? 0), icon: Scale, color: '#ef4444', href: '/cases' },
            { label: 'Registered Voters', value: detailed.voterStats?.registered ?? 0, icon: Vote, color: '#6366f1', href: null },
            { label: 'Deceased', value: detailed.deceasedCount ?? 0, icon: HeartPulse, color: '#6b7280', href: '/deceased' },
            { label: 'Resolved Cases', value: detailed.caseStats?.resolved ?? 0, icon: Scale, color: '#10b981', href: '/cases' },
          ].map((card) => (
            <Card
              key={card.label}
              className={card.href ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}
              onClick={card.href ? () => router.push(card.href!) : undefined}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: `${card.color}1a` }}>
                  <card.icon className="h-4 w-4" style={{ color: card.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight">{card.value.toLocaleString()}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Main content: Chart + Activity */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Chart area — 3 columns */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" style={{ color: statCards.find(s => s.view === chartView)?.color }} />
                  {chartView === 'overview' && 'Population Distribution'}
                  {chartView === 'seniors' && 'Senior Citizens Breakdown'}
                  {chartView === 'indigents' && 'Indigent Distribution'}
                  {chartView === 'youth' && 'Youth Demographics'}
                </CardTitle>
                <CardDescription>
                  {chartView === 'overview' && 'Click stat cards above to drill down'}
                  {chartView === 'seniors' && 'Analysis of 60+ year old residents'}
                  {chartView === 'indigents' && 'Distribution by purok'}
                  {chartView === 'youth' && 'Ages 15-30, unmarried residents'}
                </CardDescription>
              </div>
            </div>

            {/* Sub-filter tabs */}
            {subFilters.length > 0 && (
              <div className="flex gap-1 mt-2">
                {subFilters.map((sf) => (
                  <button
                    key={sf.key}
                    onClick={() => setSubFilter(sf.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      subFilter === sf.key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                No data available
              </div>
            ) : chartView === 'overview' ? (
              /* Pie chart for overview */
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value: string, entry: any) => {
                        const d = chartData.find(c => c.name === value);
                        const pct = totalInChart > 0 ? Math.round(((d?.value || 0) / totalInChart) * 100) : 0;
                        return <span className="text-xs">{value} ({pct}%)</span>;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              /* Bar chart for drill-down views */
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity — 2 columns, full height */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Latest system actions</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6">No recent activity</p>
            ) : (
              <div className="overflow-y-auto max-h-[340px] divide-y">
                {activities.slice(0, 20).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2.5 px-6 py-2 hover:bg-muted/30 transition-colors"
                  >
                    {/* Colored dot with aria label */}
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        ACTION_DOTS[entry.action] || 'bg-muted-foreground'
                      }`}
                      role="img"
                      aria-label={ACTION_LABELS[entry.action] || entry.action}
                    />

                    {/* Action label */}
                    <span className="text-xs font-medium w-14 shrink-0 truncate">
                      {ACTION_LABELS[entry.action] || entry.action.replace(/_/g, ' ')}
                    </span>

                    {/* Details */}
                    <p className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                      {entry.details || '—'}
                    </p>

                    {/* Date & time */}
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(entry.created_at)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 ml-1">
                        {formatTime(entry.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Age distribution bar + Purok distribution */}
      {detailed && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Age Distribution</CardTitle>
              <CardDescription>All residents by age group</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detailed.ageDistribution.map((d, i) => ({
                    name: d.bracket.replace(/\s*\(.*\)/, ''),
                    fullName: d.bracket,
                    value: d.count,
                    fill: PIE_PALETTE[i],
                  }))} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {detailed.ageDistribution.map((_, i) => (
                        <Cell key={i} fill={PIE_PALETTE[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Gender & Purok</CardTitle>
              <CardDescription>Residents by purok assignment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Gender quick stats */}
                <div className="flex gap-4 mb-2">
                  {detailed.genderDistribution.map((g) => (
                    <div key={g.gender} className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: g.gender === 'Male' ? DEMO_COLORS.male : DEMO_COLORS.female }}
                      />
                      <span className="text-xs font-medium">{g.gender}</span>
                      <span className="text-xs text-muted-foreground">{g.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {/* Purok bars */}
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {detailed.residentsByPurok.map((p, i) => {
                    const pct = stats.totalResidents > 0 ? Math.round((p.count / stats.totalResidents) * 100) : 0;
                    return (
                      <div key={p.purok} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">Purok {p.purok}</span>
                          <span className="text-muted-foreground">{p.count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Third row: civil status & voters, registration trend, upcoming summons */}
      {detailed && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Civil Status & Voters</CardTitle>
              <CardDescription>Living residents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {(detailed.civilStatusDistribution || []).slice(0, 5).map((c, i) => {
                  const pct = stats.totalResidents > 0 ? Math.round((c.count / stats.totalResidents) * 100) : 0;
                  return (
                    <div key={c.status} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{c.status}</span>
                        <span className="text-muted-foreground">{c.count.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary">
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {detailed.voterStats && (
                <div className="border-t pt-3">
                  {(() => {
                    const total = detailed.voterStats!.registered + detailed.voterStats!.notRegistered;
                    const pct = total > 0 ? Math.round((detailed.voterStats!.registered / total) * 100) : 0;
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium"><Vote className="h-3.5 w-3.5 text-indigo-500" />Registered Voters</span>
                          <span className="text-muted-foreground">{detailed.voterStats!.registered.toLocaleString()} of {total.toLocaleString()} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary">
                          <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">New Residents</CardTitle>
              <CardDescription>Records added in the last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              {(detailed.monthlyRegistrations || []).length === 0 ? (
                <p className="flex h-44 items-center justify-center text-sm text-muted-foreground">No new records this year</p>
              ) : (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(detailed.monthlyRegistrations || []).map(m => ({
                        name: new Date(m.month + '-01').toLocaleDateString('en-PH', { month: 'short' }),
                        value: m.count,
                      }))}
                      margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4 text-blue-500" />Cases & Hearings</CardTitle>
              <CardDescription>Upcoming summons and active cases</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <p className="px-6 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Summons</p>
              {(detailed.upcomingSummons || []).length === 0 ? (
                <p className="px-6 pb-3 text-xs text-muted-foreground">No scheduled hearings. 🎉</p>
              ) : (
                <div className="divide-y border-b">
                  {(detailed.upcomingSummons || []).slice(0, 3).map((su) => (
                    <button
                      key={su.id}
                      type="button"
                      onClick={() => router.push('/cases')}
                      className="flex w-full items-center justify-between gap-2 px-6 py-2 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{su.summoned_name || 'Resident'}</p>
                        <p className="text-[11px] text-muted-foreground">Case {su.case_number}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-medium">{formatDate(su.summon_date)}</p>
                        {su.summon_time && <p className="text-[10px] text-muted-foreground">{su.summon_time}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="px-6 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Cases</p>
              {(detailed.activeCases || []).length === 0 ? (
                <p className="px-6 pb-4 text-xs text-muted-foreground">No pending or ongoing cases.</p>
              ) : (
                <div className="divide-y">
                  {(detailed.activeCases || []).slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => router.push('/cases')}
                      className="flex w-full items-center justify-between gap-2 px-6 py-2 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{c.case_number} · <span className="capitalize">{c.case_type}</span></p>
                        <p className="truncate text-[11px] text-muted-foreground">{c.parties || 'No parties recorded'}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium capitalize ${c.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                        {c.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <SummaryReportDialog open={summaryOpen} onClose={() => setSummaryOpen(false)} />
    </div>
  );
}
