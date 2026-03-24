'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { type User, getAPI } from './ipc';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const api = getAPI();
    if (!api) {
      setLoading(false);
      return;
    }
    try {
      const currentUser = await api.getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const api = getAPI();
    if (!api) return { success: false, error: 'Not running in Electron' };

    const result = await api.login(username, password);
    if (result.success && result.user) {
      setUser(result.user);
    }
    return result;
  };

  const logout = async () => {
    const api = getAPI();
    if (!api) return;
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
