"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export interface AuthUser {
  email: string;
  displayName?: string;
  role: string;
  groups?: string[];
  namespaces?: string[];
  personalNamespace?: string;
  avatarURL?: string;
  mustChangePassword?: boolean;
}

export interface AuthConfig {
  enabled: boolean;
  issuerURL?: string;
  personalNamespaces?: {
    enabled: boolean;
    template: string;
  };
  registration?: {
    autoProvision: boolean;
  };
  localAuth?: {
    enabled: boolean;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  authConfig: AuthConfig | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  authEnabled: boolean;
  login: () => void;
  loginLocal: (email: string, password: string) => Promise<{ ok: boolean; error?: string; mustChangePassword?: boolean }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authConfig: null,
  loading: true,
  isAuthenticated: false,
  isAdmin: false,
  authEnabled: false,
  login: () => {},
  loginLocal: async () => ({ ok: false, error: "not initialized" }),
  changePassword: async () => ({ ok: false, error: "not initialized" }),
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAuthConfig = useCallback(async () => {
    try {
      const res = await fetch("/auth/config", {
        credentials: "include",
      });
      if (res.ok) {
        const config = await res.json();
        setAuthConfig(config);
        return config as AuthConfig;
      }
    } catch {
      // Auth config endpoint not available - auth is disabled
      setAuthConfig({ enabled: false });
    }
    return null;
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/auth/me", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setUser({
            email: data.email,
            displayName: data.displayName,
            role: data.role,
            groups: data.groups,
            namespaces: data.namespaces,
            personalNamespace: data.personalNamespace,
            avatarURL: data.avatarURL,
            mustChangePassword: data.mustChangePassword,
          });
          return true;
        }
      }
    } catch {
      // Ignore - user not authenticated
    }
    setUser(null);
    return false;
  }, []);

  const refresh = useCallback(async () => {
    await fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    async function init() {
      const config = await fetchAuthConfig();
      if (config?.enabled) {
        await fetchMe();
      }
      setLoading(false);
    }
    init();
  }, [fetchAuthConfig, fetchMe]);

  const login = useCallback(() => {
    // Use relative URL so the state cookie is set on the same host as the callback
    window.location.href = "/auth/login";
  }, []);

  const loginLocal = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/auth/login/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.message || "Invalid email or password" };
      }
      await fetchMe();
      return { ok: true, mustChangePassword: !!data.mustChangePassword };
    } catch {
      return { ok: false, error: "Failed to sign in" };
    }
  }, [fetchMe]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      const res = await fetch("/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.message || "Failed to change password" };
      }
      await fetchMe();
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to change password" };
    }
  }, [fetchMe]);

  const logout = useCallback(async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore errors
    }
    setUser(null);
    window.location.href = "/login";
  }, []);

  const isAuthenticated = user !== null;
  const isAdmin = user?.role === "admin" || (authConfig !== null && !authConfig.enabled);
  const authEnabled = authConfig?.enabled ?? false;

  return (
    <AuthContext value={{
      user,
      authConfig,
      loading,
      isAuthenticated,
      isAdmin,
      authEnabled,
      login,
      loginLocal,
      changePassword,
      logout,
      refresh,
    }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
