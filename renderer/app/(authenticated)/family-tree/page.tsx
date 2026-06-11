'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ReactFlowProvider } from 'reactflow';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { FamilyTreeView, fullGender } from '@/components/family-tree-view';
import { ResidentDetailDialog } from '@/components/resident-detail-dialog';
import { getAPI, type Resident, type TreeResident } from '@/lib/ipc';
import { getGradientForId, getInitials } from '@/lib/constants';

function FamilyTreePage() {
  const searchParams = useSearchParams();
  const [sq, setSq] = useState('');
  const [sr, setSr] = useState<Resident[]>([]);
  const [sel, setSel] = useState<Resident | null>(null);
  const [allResidents, setAllResidents] = useState<TreeResident[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Resident detail modal (opened by clicking a tree node)
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const api = getAPI();
    if (!api) return;
    api.getResidentsForTree().then(data => { setAllResidents(data); setLoaded(true); });
  }, []);

  // Allow other pages to deep-link: /family-tree?residentId=123
  useEffect(() => {
    const rid = searchParams.get('residentId');
    if (rid && !sel) {
      pick({ id: Number(rid) });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sq.trim() || sq.length < 2) { setSr([]); return; }
    const t = setTimeout(async () => {
      const api = getAPI();
      if (!api) return;
      setSr(await api.searchResidents(sq, 15));
    }, 300);
    return () => clearTimeout(t);
  }, [sq]);

  const pick = useCallback(async (r: Resident | { id: number }) => {
    const api = getAPI();
    if (!api) return;
    const full = await api.getResident(r.id);
    if (full) setSel(full);
    const freshTree = await api.getResidentsForTree();
    setAllResidents(freshTree);
    setSq(''); setSr([]);
  }, []);

  const handleRecenter = useCallback((id: number) => {
    pick({ id });
  }, [pick]);

  const handlePersonClick = useCallback((id: number) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader title="Family Tree" description="Search for a resident to view their family connections." />
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search resident by name..." value={sq} onChange={e => setSq(e.target.value)} className="pl-9" />
        {sr.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg">
            {sr.map(r => {
              const [c1, c2] = getGradientForId(r.id);
              const initials = getInitials(`${r.first_name} ${r.last_name}`);
              return (
                <button key={r.id} className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors" onClick={() => pick(r)}>
                  <div className="flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ width: 32, height: 32, borderRadius: '22%', background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials}</div>
                  <div className="text-left min-w-0">
                    <p className="font-medium truncate">{r.first_name} {r.last_name}</p>
                    <p className="text-xs text-muted-foreground">{fullGender(r.gender)} · Age {r.age}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {sel && loaded ? (
        <ReactFlowProvider>
          <FamilyTreeView
            resident={sel}
            allResidents={allResidents}
            onRecenter={handleRecenter}
            onPersonClick={handlePersonClick}
          />
        </ReactFlowProvider>
      ) : (
        <Card><CardContent className="flex flex-col items-center justify-center py-24 gap-2">
          <GitBranchIcon className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Search for a resident above to view their family tree.</p>
        </CardContent></Card>
      )}

      <ResidentDetailDialog residentId={detailId} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-muted-foreground">Loading...</div>}>
      <FamilyTreePage />
    </Suspense>
  );
}

function GitBranchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}
