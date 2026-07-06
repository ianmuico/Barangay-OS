import { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, ApiError } from '@/api';
import { Button, Loading } from '@/ui';
import { colors } from '@/theme';

// Scan a resident QR (payload "brgy:resident:<uid>") → open their profile.
export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [handled, setHandled] = useState(false);

  if (!permission) return <Loading text="Preparing camera..." />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.text, textAlign: 'center', marginBottom: 16 }}>
          Camera access is needed to scan resident QR codes.
        </Text>
        <Button title="Grant Camera Permission" onPress={requestPermission} />
      </View>
    );
  }

  const onScanned = async ({ data }: { data: string }) => {
    if (handled || busy) return;
    const match = /^brgy:resident:(.+)$/.exec(data.trim());
    if (!match) return; // ignore non-resident codes
    setHandled(true);
    setBusy(true);
    try {
      const resident = await api.getResidentByUid(match[1]);
      router.replace(`/(app)/residents/${resident.id}`);
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 404
        ? 'That QR is not a resident in this barangay.'
        : e instanceof ApiError ? e.message : 'Lookup failed.';
      // Allow rescans after an error
      setHandled(false);
      setBusy(false);
      alert(msg);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Scan QR' }} />
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />
      <View style={styles.hint}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          {busy ? 'Looking up resident...' : 'Point the camera at a resident QR card'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 10 },
});
