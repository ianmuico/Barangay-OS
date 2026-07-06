import { useState } from 'react';
import { Alert, ScrollView, Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth';
import { getActiveUrl } from '@/api';
import { Avatar, Badge, Button, Card, SectionLabel } from '@/ui';
import { colors } from '@/theme';
import { applyOtaUpdate, checkForOtaUpdate, currentVersionLabel } from '@/updates';

export default function Settings() {
  const { user, connection, logout, clearConnection } = useAuth();
  const perms = user?.permissions;
  const [checking, setChecking] = useState(false);

  const handleCheckUpdate = async () => {
    setChecking(true);
    const result = await checkForOtaUpdate();
    setChecking(false);
    if (result.status === 'updated') {
      Alert.alert('Update ready', result.message, [
        { text: 'Restart now', onPress: () => applyOtaUpdate() },
        { text: 'Later', style: 'cancel' },
      ]);
    } else {
      Alert.alert(
        result.status === 'up-to-date' ? 'Up to date' : result.status === 'unavailable' ? 'Not available' : 'Update check failed',
        result.message,
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={user?.name || user?.username || '?'} size={54} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.sub}>@{user?.username}</Text>
          <View style={{ marginTop: 8 }}>
            <Badge text={user?.role || 'No role'} tone="primary" />
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionLabel text="Your permissions" />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {perms?.search && <Badge text="Search" tone="success" />}
          {perms?.read && <Badge text="Read" tone="success" />}
          {perms?.create && <Badge text="Create / Edit" tone="success" />}
          {perms?.delete && <Badge text="Delete" tone="success" />}
          {perms && !perms.search && !perms.read && !perms.create && !perms.delete && (
            <Text style={{ color: colors.muted }}>No permissions assigned.</Text>
          )}
        </View>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionLabel text="Connection" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: connection?.webUrl ? 8 : 0 }}>
          <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>{connection?.baseUrl}</Text>
          {getActiveUrl() === connection?.baseUrl && <Badge text="Active" tone="success" />}
        </View>
        {connection?.webUrl ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>{connection.webUrl}</Text>
            {getActiveUrl() === connection.webUrl && <Badge text="Active" tone="success" />}
          </View>
        ) : (
          <Text style={{ color: colors.faint, fontSize: 11.5, marginTop: 6 }}>
            No internet URL set — the app only works on the office Wi-Fi. The admin can enable Internet Access in Settings → Online Mode.
          </Text>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionLabel text="App updates" />
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>{currentVersionLabel()}</Text>
        <Button title="Check for Updates" variant="outline" onPress={handleCheckUpdate} loading={checking} />
      </Card>

      <View style={{ gap: 10, marginTop: 18 }}>
        <Button title="Log Out" variant="outline" onPress={async () => { await logout(); router.replace('/login'); }} />
        <Button title="Disconnect this device" variant="danger" onPress={async () => { await clearConnection(); router.replace('/setup'); }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 19, fontWeight: '800', color: colors.text },
  sub: { color: colors.muted, marginTop: 2, fontSize: 13 },
});
