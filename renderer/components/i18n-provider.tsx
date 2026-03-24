'use client';

import '@/lib/i18n';

// This component exists solely to initialize i18n on the client side.
// react-i18next uses React.createContext which requires a client component.
export function I18nProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
