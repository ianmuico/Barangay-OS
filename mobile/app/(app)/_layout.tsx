import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '@/auth';
import { colors } from '@/theme';

// Simple emoji tab icons keep the dependency surface minimal.
function Icon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function AppLayout() {
  const { user, ready, connection } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!connection) router.replace('/setup');
    else if (!user) router.replace('/login');
  }, [ready, user, connection]);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
      }}
    >
      <Tabs.Screen
        name="residents/index"
        options={{ title: 'Residents', tabBarIcon: ({ color }) => <Icon glyph="👥" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Account', tabBarIcon: ({ color }) => <Icon glyph="⚙️" color={color} /> }}
      />
      {/* Detail/new/edit are pushed screens, hidden from the tab bar */}
      <Tabs.Screen name="residents/[id]" options={{ href: null, title: 'Resident' }} />
      <Tabs.Screen name="residents/new" options={{ href: null, title: 'New Resident' }} />
      <Tabs.Screen name="residents/edit/[id]" options={{ href: null, title: 'Edit Resident' }} />
      <Tabs.Screen name="scan" options={{ href: null, title: 'Scan QR' }} />
    </Tabs>
  );
}
