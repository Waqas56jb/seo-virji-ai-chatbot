import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onAuthLost, refreshSession, setAccessToken } from '../services/apiClient.js';

const AuthContext = createContext(null);

/** Restores the session from the HttpOnly refresh cookie on load; exposes login/logout. */
export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [status, setStatus] = useState('checking'); // checking | authenticated | anonymous

  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((data) => {
        if (cancelled) return;
        setAdmin(data.admin);
        setStatus('authenticated');
      })
      .catch(() => !cancelled && setStatus('anonymous'));
    const off = onAuthLost(() => {
      setAdmin(null);
      setStatus('anonymous');
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/api/admin/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setAdmin(data.admin);
    setStatus('authenticated');
    return data.admin;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/admin/auth/logout');
    } finally {
      setAccessToken(null);
      setAdmin(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(() => ({ admin, status, login, logout }), [admin, status, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
