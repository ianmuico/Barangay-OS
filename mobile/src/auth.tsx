import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { api, configure } from './api';
import type { AppUser, Connection } from './types';

// Connection (server URL + device key) is non-secret-ish but the device key is
// sensitive → SecureStore. User session token also in SecureStore.
const URL_KEY = 'brgy.baseUrl';
const WEB_URL_KEY = 'brgy.webUrl';
const DEVICE_KEY = 'brgy.deviceKey';
const TOKEN_KEY = 'brgy.userToken';

async function secureGet(k: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(k); } catch { return AsyncStorage.getItem(k); }
}
async function secureSet(k: string, v: string): Promise<void> {
  try { await SecureStore.setItemAsync(k, v); } catch { await AsyncStorage.setItem(k, v); }
}
async function secureDel(k: string): Promise<void> {
  try { await SecureStore.deleteItemAsync(k); } catch { await AsyncStorage.removeItem(k); }
}

interface AuthState {
  ready: boolean;
  connection: Connection | null;
  user: AppUser | null;
  saveConnection: (c: Connection) => Promise<void>;
  clearConnection: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (perm: 'search' | 'read' | 'create' | 'delete') => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    (async () => {
      const baseUrl = await secureGet(URL_KEY);
      const webUrl = await secureGet(WEB_URL_KEY);
      const dk = await secureGet(DEVICE_KEY);
      const token = await secureGet(TOKEN_KEY);
      if (baseUrl && dk) {
        const conn = { baseUrl, webUrl, deviceKey: dk };
        setConnection(conn);
        configure({ baseUrl, webUrl, deviceKey: dk, userToken: token });
        if (token) {
          try {
            const me = await api.me();
            setUser(me.user);
          } catch {
            await secureDel(TOKEN_KEY);
            configure({ userToken: null });
          }
        }
      }
      setReady(true);
    })();
  }, []);

  const saveConnection = useCallback(async (c: Connection) => {
    await secureSet(URL_KEY, c.baseUrl);
    if (c.webUrl) await secureSet(WEB_URL_KEY, c.webUrl);
    else await secureDel(WEB_URL_KEY);
    await secureSet(DEVICE_KEY, c.deviceKey);
    configure({ baseUrl: c.baseUrl, webUrl: c.webUrl || null, deviceKey: c.deviceKey });
    setConnection(c);
  }, []);

  const clearConnection = useCallback(async () => {
    await secureDel(URL_KEY); await secureDel(WEB_URL_KEY); await secureDel(DEVICE_KEY); await secureDel(TOKEN_KEY);
    configure({ baseUrl: '', webUrl: null, deviceKey: '', userToken: null });
    setConnection(null);
    setUser(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    await secureSet(TOKEN_KEY, res.token);
    configure({ userToken: res.token });
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    await secureDel(TOKEN_KEY);
    configure({ userToken: null });
    setUser(null);
  }, []);

  const can = useCallback((perm: 'search' | 'read' | 'create' | 'delete') => {
    return !!user?.permissions?.[perm];
  }, [user]);

  return (
    <AuthContext.Provider value={{ ready, connection, user, saveConnection, clearConnection, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
