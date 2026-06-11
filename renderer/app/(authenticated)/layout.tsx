'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ScrollHeaderProvider } from '@/lib/scroll-header-context';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { SummonReminders } from '@/components/summon-reminders';
import { SetupWizard } from '@/components/setup-wizard';
import { ErrorBoundary } from '@/components/error-boundary';
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

  // Session timeout: periodically check if session is still valid
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      const api = getAPI();
      if (!api) return;
      const currentUser = await api.getCurrentUser();
      if (!currentUser) {
        // Session expired — redirect to login
        router.replace('/login');
      }
    }, 60_000); // Check every 60 seconds
    return () => clearInterval(interval);
  }, [user, router]);

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
      {/* Skip navigation link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:px-4 focus:py-2 focus:rounded-md focus:ring-2 focus:ring-ring focus:text-foreground"
      >
        Skip to content
      </a>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <SummonReminders />
          <main id="main-content" className="flex-1 overflow-auto p-6" tabIndex={-1}>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </ScrollHeaderProvider>
  );
}
