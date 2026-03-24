'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ScrollHeaderProvider } from '@/lib/scroll-header-context';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { SetupWizard } from '@/components/setup-wizard';
import { getAPI } from '@/lib/ipc';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  // Check if first-run setup is needed
  useEffect(() => {
    if (!user) return;
    const api = getAPI();
    if (!api) {
      setSetupCompleted(true); // Can't check, assume completed
      return;
    }
    api.getSetting('setup_completed').then((val) => {
      setSetupCompleted(val === '1');
    });
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  // Show setup wizard on first run
  if (setupCompleted === false) {
    return <SetupWizard onComplete={() => setSetupCompleted(true)} />;
  }

  // Still checking setup status
  if (setupCompleted === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <ScrollHeaderProvider>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </ScrollHeaderProvider>
  );
}
