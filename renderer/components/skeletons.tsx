'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div><div className="h-7 w-40 rounded bg-muted" /><div className="mt-1 h-4 w-56 rounded bg-muted" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-4 rounded bg-muted" />
            </CardHeader>
            <CardContent><div className="h-8 w-16 rounded bg-muted" /><div className="mt-1 h-3 w-32 rounded bg-muted" /></CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4"><CardHeader><div className="h-5 w-20 rounded bg-muted" /></CardHeader><CardContent><div className="space-y-4">{[1,2,3].map(i=><div key={i}><div className="h-3 w-full rounded bg-muted" /><div className="mt-2 h-2 w-full rounded-full bg-muted" /></div>)}</div></CardContent></Card>
        <Card className="lg:col-span-3"><CardHeader><div className="h-5 w-28 rounded bg-muted" /></CardHeader><CardContent><div className="space-y-4">{[1,2,3,4].map(i=><div key={i} className="flex gap-3"><div className="h-3 w-3 rounded bg-muted shrink-0" /><div className="flex-1"><div className="h-3 w-full rounded bg-muted" /><div className="mt-1 h-2 w-24 rounded bg-muted" /></div></div>)}</div></CardContent></Card>
      </div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-80 rounded-md bg-muted" />
        <div className="h-10 w-32 rounded-md bg-muted" />
      </div>
      <div className="rounded-md border">
        <div className="border-b px-4 py-3 flex gap-6">
          {[1,2,3,4,5,6].map(i=><div key={i} className="h-4 w-20 rounded bg-muted" />)}
        </div>
        {[1,2,3,4,5,6,7,8].map(i=>(
          <div key={i} className="border-b px-4 py-3 flex gap-6">
            {[1,2,3,4,5,6].map(j=><div key={j} className="h-4 w-20 rounded bg-muted" />)}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="flex gap-2"><div className="h-8 w-20 rounded bg-muted" /><div className="h-8 w-20 rounded bg-muted" /></div>
      </div>
    </div>
  );
}
