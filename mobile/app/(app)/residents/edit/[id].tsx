import { useCallback, useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth';
import { api } from '@/api';
import { ResidentForm } from '@/ResidentForm';
import { Loading } from '@/ui';
import type { Resident } from '@/types';

export default function EditResident() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const [resident, setResident] = useState<Resident | null>(null);

  useEffect(() => { if (!can('create')) router.back(); }, [can]);

  const load = useCallback(async () => {
    try { setResident(await api.getResident(Number(id))); } catch { router.back(); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!resident) return <Loading />;
  return (
    <>
      <Stack.Screen options={{ title: 'Edit Resident' }} />
      <ResidentForm existing={resident} />
    </>
  );
}
