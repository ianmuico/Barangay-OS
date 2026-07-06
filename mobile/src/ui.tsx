import React from 'react';
import {
  Text, TextInput, TouchableOpacity, View, ActivityIndicator, StyleSheet,
  type TextInputProps, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { avatarColor, colors, initials, radius, shadow } from './theme';

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: {
  title: string; onPress: () => void; variant?: 'primary' | 'outline' | 'danger';
  loading?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? '#fef2f2' : 'transparent';
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : colors.primary;
  const border = variant === 'primary' ? colors.primary : variant === 'danger' ? '#fecaca' : colors.border;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.input, focused && { borderColor: colors.primaryLight, borderWidth: 1.5 }]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Uppercase section label, like the desktop sidebar's "HOME" / "DOCUMENTS"
export function SectionLabel({ text, style }: { text: string; style?: ViewStyle }) {
  return <Text style={[styles.section, style as any]}>{text}</Text>;
}

export function Badge({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'primary' | 'warn' | 'danger' | 'success' }) {
  const map = {
    muted: { bg: '#eef0f3', fg: colors.muted },
    primary: { bg: '#e3edf9', fg: colors.primary },
    warn: { bg: '#fef3c7', fg: colors.warn },
    danger: { bg: '#fee2e2', fg: colors.danger },
    success: { bg: '#dcfce7', fg: colors.success },
  }[tone];
  return (
    <View style={{ backgroundColor: map.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5, alignSelf: 'flex-start' }}>
      <Text style={{ color: map.fg, fontSize: 11, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

// Colored-initials avatar, same look as the desktop's user/resident avatars
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.32,
      backgroundColor: avatarColor(name), alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

// Navy gradient hero header — same band as the desktop dashboard/report header
export function Hero({ title, subtitle, kicker, children }: {
  title: string; subtitle?: string; kicker?: string; children?: React.ReactNode;
}) {
  return (
    <LinearGradient colors={[colors.primary, colors.primaryLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      {kicker ? <Text style={styles.heroKicker}>{kicker}</Text> : null}
      <Text style={styles.heroTitle}>{title}</Text>
      {subtitle ? <Text style={styles.heroSub}>{subtitle}</Text> : null}
      {children}
    </LinearGradient>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{String(value)}</Text>
    </View>
  );
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator color={colors.primary} size="large" />
      {text ? <Text style={{ color: colors.muted, marginTop: 12 }}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1 },
  btnText: { fontWeight: '700', fontSize: 15 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.text,
  },
  card: { backgroundColor: colors.card, borderRadius: radius + 2, borderWidth: 1, borderColor: colors.border, padding: 16, ...shadow },
  section: { color: colors.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  hero: { borderRadius: radius + 4, padding: 20, ...shadow },
  heroKicker: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4, lineHeight: 19 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.muted, fontSize: 13 },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
});
