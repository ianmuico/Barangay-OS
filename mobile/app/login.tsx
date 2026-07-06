import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth';
import { ApiError } from '@/api';
import { Button, Card, Field, Hero, SectionLabel } from '@/ui';
import { colors } from '@/theme';

export default function Login() {
  const { login, connection, clearConnection } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!username.trim() || !password) { setError('Enter your username and password.'); return; }
    setBusy(true);
    try {
      await login(username.trim(), password);
      router.replace('/(app)/residents');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed.');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24 }} keyboardShouldPersistTaps="handled">
        <Hero
          kicker="Barangay System"
          title="Sign in"
          subtitle="Use the username and password your barangay admin gave you."
        />

        <Card style={{ marginTop: 16 }}>
          <SectionLabel text="Your account" />
          <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="your.username" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />

          {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}

          <Button title="Sign In" onPress={submit} loading={busy} />
        </Card>

        <View style={{ marginTop: 22, alignItems: 'center' }}>
          <Text style={{ color: colors.faint, fontSize: 12 }}>Connected to {connection?.baseUrl}</Text>
          <TouchableOpacity onPress={async () => { await clearConnection(); router.replace('/setup'); }} style={{ marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Change server / device</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
