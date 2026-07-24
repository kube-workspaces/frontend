"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { listNamespaces, Namespace } from "./api";
import { useAuth } from "./auth";

const ALL_NAMESPACES = "";

interface NamespaceContextValue {
  namespace: string; // "" means all namespaces
  namespaces: Namespace[];
  setNamespace: (ns: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const NamespaceContext = createContext<NamespaceContextValue>({
  namespace: ALL_NAMESPACES,
  namespaces: [],
  setNamespace: () => {},
  refresh: async () => {},
  loading: true,
});

export function useNamespace() {
  return useContext(NamespaceContext);
}

export function NamespaceProvider({ children }: { children: React.ReactNode }) {
  const [namespace, setNamespaceState] = useState<string>(ALL_NAMESPACES);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const stored = localStorage.getItem("selectedNamespace");
    if (stored !== null) {
      requestAnimationFrame(() => setNamespaceState(stored));
    } else if (user?.personalNamespace) {
      // Default new users to their personal namespace
      requestAnimationFrame(() => setNamespaceState(user.personalNamespace!));
    }
  }, [user]);

  const fetchNamespaces = useCallback(async () => {
    try {
      const ns = await listNamespaces();
      setNamespaces(ns);
    } catch {
      // Silently fail - namespaces list will be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ns = await listNamespaces();
        if (!cancelled) setNamespaces(ns);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setNamespace = useCallback(
    (ns: string) => {
      setNamespaceState(ns);
      localStorage.setItem("selectedNamespace", ns);
    },
    []
  );

  const refresh = useCallback(async () => {
    await fetchNamespaces();
  }, [fetchNamespaces]);

  return (
    <NamespaceContext value={{ namespace, namespaces, setNamespace, refresh, loading }}>
      {children}
    </NamespaceContext>
  );
}
