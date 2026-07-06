// Design tokens mirroring the desktop app (navy sidebar, light gray canvas,
// white bordered cards, green accents) so both apps feel like one product.
export const colors = {
  primary: '#1e3a5f',
  primaryLight: '#2d5a8f',
  primaryDark: '#152c4a',
  accent: '#16a34a',
  bg: '#f5f6f8',
  card: '#ffffff',
  border: '#e2e5ea',
  text: '#1a1d21',
  muted: '#6b7280',
  faint: '#9ca3af',
  danger: '#dc2626',
  success: '#16a34a',
  warn: '#d97706',
};

export const radius = 12;

// Subtle elevation used on cards/FABs (matches the desktop's soft shadows)
export const shadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

// Deterministic avatar color from a name — same trick as the desktop avatars
const AVATAR_COLORS = ['#16a34a', '#2563eb', '#8b5cf6', '#d97706', '#db2777', '#0d9488', '#dc2626', '#4f46e5'];
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] || '' : '')).toUpperCase();
}
