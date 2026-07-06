import { useState } from 'react';
import { Alert, ScrollView, Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api, ApiError } from './api';
import { Button, Field } from './ui';
import { colors, radius } from './theme';
import type { Resident } from './types';

const GENDERS = ['Male', 'Female'];
const CIVIL = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

function Chips({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
      {options.map(o => {
        const active = value === o;
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text style={[styles.chipText, active && { color: '#fff' }]}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Shared create/edit form. `existing` present → edit (sends row_version).
export function ResidentForm({ existing }: { existing?: Resident }) {
  const [f, setF] = useState({
    first_name: existing?.first_name || '',
    middle_name: existing?.middle_name || '',
    last_name: existing?.last_name || '',
    suffix: existing?.suffix || '',
    birth_date: existing?.birth_date || '',
    gender: existing?.gender || 'Male',
    civil_status: existing?.civil_status || 'Single',
    purok: existing?.purok || '',
    address: existing?.address || '',
    contact_number: existing?.contact_number || '',
    occupation: existing?.occupation || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }));

  const submit = async (force = false) => {
    if (!f.first_name.trim() || !f.last_name.trim() || !f.birth_date.trim()) {
      Alert.alert('Missing info', 'First name, last name, and birth date are required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birth_date.trim())) {
      Alert.alert('Birth date format', 'Use YYYY-MM-DD, e.g. 1990-01-31.');
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        first_name: f.first_name.trim(), middle_name: f.middle_name.trim() || null,
        last_name: f.last_name.trim(), suffix: f.suffix.trim() || null,
        birth_date: f.birth_date.trim(), gender: f.gender, civil_status: f.civil_status,
        purok: f.purok.trim() || null, address: f.address.trim() || null,
        contact_number: f.contact_number.trim() || null, occupation: f.occupation.trim() || null,
      };
      if (existing) {
        payload.row_version = existing.row_version;
        await api.updateResident(existing.id, payload);
      } else {
        if (force) payload.force = true;
        await api.createResident(payload);
      }
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && !existing && e.body?.existing) {
        const ex = e.body.existing;
        Alert.alert('Possible duplicate', `${ex.first_name} ${ex.last_name} (${ex.birth_date}) already exists. Add as a separate new record anyway?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add anyway', onPress: () => submit(true) },
        ]);
      } else if (e instanceof ApiError && e.status === 409) {
        Alert.alert('Changed by someone else', 'This resident was just updated by another user. Go back and reopen to see the latest.');
      } else {
        Alert.alert('Could not save', e instanceof ApiError ? e.message : 'Failed.');
      }
    } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Field label="First Name *" value={f.first_name} onChangeText={(v) => set('first_name', v)} />
      <Field label="Middle Name" value={f.middle_name} onChangeText={(v) => set('middle_name', v)} />
      <Field label="Last Name *" value={f.last_name} onChangeText={(v) => set('last_name', v)} />
      <Field label="Suffix" value={f.suffix} onChangeText={(v) => set('suffix', v)} placeholder="Jr., Sr., III" />
      <Field label="Birth Date * (YYYY-MM-DD)" value={f.birth_date} onChangeText={(v) => set('birth_date', v)} placeholder="1990-01-31" autoCapitalize="none" />

      <Text style={styles.label}>Gender</Text>
      <Chips value={f.gender} options={GENDERS} onChange={(v) => set('gender', v)} />

      <Text style={styles.label}>Civil Status</Text>
      <Chips value={f.civil_status} options={CIVIL} onChange={(v) => set('civil_status', v)} />

      <Field label="Purok" value={f.purok} onChangeText={(v) => set('purok', v)} />
      <Field label="Address" value={f.address} onChangeText={(v) => set('address', v)} />
      <Field label="Contact Number" value={f.contact_number} onChangeText={(v) => set('contact_number', v)} keyboardType="phone-pad" />
      <Field label="Occupation" value={f.occupation} onChangeText={(v) => set('occupation', v)} />

      <Button title={existing ? 'Save Changes' : 'Add Resident'} onPress={() => submit(false)} loading={busy} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
