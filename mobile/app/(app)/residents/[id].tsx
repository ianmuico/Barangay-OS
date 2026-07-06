import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { useAuth } from '@/auth';
import { api, ApiError } from '@/api';
import { Avatar, Badge, Button, Card, InfoRow, Loading, SectionLabel } from '@/ui';
import { colors } from '@/theme';
import type { Resident } from '@/types';

export default function ResidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const [r, setR] = useState<Resident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setR(await api.getResident(Number(id)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load resident.');
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmDelete = () => {
    Alert.alert('Delete Resident', `Permanently delete ${r?.first_name} ${r?.last_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteResident(Number(id));
            router.back();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof ApiError ? e.message : 'Failed.');
          } finally { setDeleting(false); }
        },
      },
    ]);
  };

  if (loading) return <Loading />;
  if (error || !r) return <View style={{ padding: 24 }}><Text style={{ color: colors.danger }}>{error || 'Not found'}</Text></View>;

  const name = [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(' ');

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: 'Resident' }} />

      {/* Profile header card */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={`${r.first_name} ${r.last_name}`} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
            {r.gender}{r.age != null ? ` · ${r.age} yrs` : ''}{r.purok ? ` · Purok ${r.purok}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {r.status === 'deceased' && <Badge text="Deceased" tone="danger" />}
            {(r.age ?? 0) >= 60 && r.status !== 'deceased' && <Badge text="Senior" tone="primary" />}
            {!!r.is_indigent && <Badge text="Indigent" tone="warn" />}
            {!!r.is_4ps && <Badge text="4Ps" tone="success" />}
            {!!r.is_pwd && <Badge text="PWD" tone="primary" />}
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionLabel text="Personal Information" />
        <InfoRow label="Birth Date" value={r.birth_date} />
        <InfoRow label="Age" value={r.age} />
        <InfoRow label="Gender" value={r.gender} />
        <InfoRow label="Civil Status" value={r.civil_status} />
        <InfoRow label="Purok" value={r.purok} />
        <InfoRow label="Address" value={r.address} />
        <InfoRow label="Contact" value={r.contact_number} />
        <InfoRow label="Occupation" value={r.occupation} />
        <InfoRow label="Voter Status" value={r.voter_status} />
        <InfoRow label="Religion" value={r.religion} />
        <InfoRow label="Citizenship" value={r.citizenship} />
        <InfoRow label="Education" value={r.educational_attainment} />
        {!!r.is_pwd && <InfoRow label="PWD Note" value={r.pwd_note} />}
      </Card>

      <View style={{ gap: 10, marginTop: 16 }}>
        {can('create') && (
          <Button title="Edit" onPress={() => router.push(`/(app)/residents/edit/${r.id}`)} />
        )}
        {can('delete') && (
          <Button title="Delete" variant="danger" onPress={confirmDelete} loading={deleting} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 19, fontWeight: '800', color: colors.text },
});
