import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/auth';
import { Loading } from '@/ui';

// Entry gate: route to setup → login → app based on stored state.
export default function Index() {
  const { ready, connection, user } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!connection) router.replace('/setup');
    else if (!user) router.replace('/login');
    else router.replace('/(app)/residents');
  }, [ready, connection, user]);

  return <Loading text="Starting..." />;
}
