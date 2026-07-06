import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { useAuth } from '@/auth';
import { ResidentForm } from '@/ResidentForm';

export default function NewResident() {
  const { can } = useAuth();
  useEffect(() => { if (!can('create')) router.back(); }, [can]);
  return (
    <>
      <Stack.Screen options={{ title: 'New Resident' }} />
      <ResidentForm />
    </>
  );
}
