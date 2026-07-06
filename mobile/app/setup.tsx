import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth';
import { api } from '@/api';
import { Button, Card, Field, Hero, SectionLabel } from '@/ui';
import { colors } from '@/theme';

// First-run: enter the desktop server's Wi-Fi URL and/or Internet URL, plus
// this device's key (issued by the admin in Settings → Online Mode).
// The app automatically uses whichever address is reachable.
export default function Setup() {
  const { saveConnection } = useAuth();
  const [url, setUrl] = useState('http://');
  const [webUrl, setWebUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const test = async () => {
    setError(''); setOk(''); setBusy(true);
    const results: string[] = [];
    const wifi = url.trim() && url.trim() !== 'http://' ? url.trim() : '';
    const web = webUrl.trim();
    if (!wifi && !web) { setError('Enter at least one server URL.'); setBusy(false); return; }
    try {
      if (wifi) {
        try {
          const h = await api.healthAt(wifi);
          results.push(`Wi-Fi ✓ (${h.barangay})`);
        } catch { results.push('Wi-Fi ✗ not reachable'); }
      }
      if (web) {
        try {
          const h = await api.healthAt(web);
          results.push(`Internet ✓ (${h.barangay})`);
        } catch { results.push('Internet ✗ not reachable'); }
      }
      const anyOk = results.some(r => r.includes('✓'));
      (anyOk ? setOk : setError)(results.join('  ·  '));
    } finally { setBusy(false); }
  };

  const connect = async () => {
    setError('');
    const wifi = url.trim() && url.trim() !== 'http://' ? url.trim() : '';
    const web = webUrl.trim();
    if (!wifi && !web) { setError('Enter at least one server URL.'); return; }
    if (!key.trim()) { setError('Enter the device key.'); return; }
    setBusy(true);
    try {
      // Verify at least one address answers before saving
      let reachable = false;
      for (const u of [wifi, web].filter(Boolean)) {
        try { await api.healthAt(u); reachable = true; break; } catch { /* try next */ }
      }
      if (!reachable) {
        setError('Could not reach the server on either URL.');
        return;
      }
      await saveConnection({
        baseUrl: wifi || web,
        webUrl: wifi && web ? web : null,
        deviceKey: key.trim(),
      });
      router.replace('/login');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24 }} keyboardShouldPersistTaps="handled">
        <Hero
          kicker="Barangay System"
          title="Connect to your office"
          subtitle="On the desktop app, open Settings → Online Mode. Copy the Server URL (and the Internet URL if enabled), then issue a Mobile Device Key."
        />

        <Card style={{ marginTop: 16 }}>
          <SectionLabel text="Server addresses" />
          <Field
            label="Wi-Fi URL (same network as the office)"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.5:3001"
          />
          <Field
            label="Internet URL (optional — works from anywhere)"
            value={webUrl}
            onChangeText={setWebUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://....trycloudflare.com"
          />
          <Text style={{ color: colors.faint, fontSize: 11.5, marginTop: -6, marginBottom: 12 }}>
            The app tries the Wi-Fi address first and automatically switches to the Internet URL when you are away from the office.
          </Text>

          <SectionLabel text="Device" />
          <Field
            label="Device Key"
            value={key}
            onChangeText={setKey}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="bmc_..."
          />

          {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
          {ok ? <Text style={{ color: colors.success, marginBottom: 12 }}>{ok}</Text> : null}

          <View style={{ gap: 10 }}>
            <Button title="Test Connection" variant="outline" onPress={test} loading={busy} />
            <Button title="Save & Continue" onPress={connect} loading={busy} />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
