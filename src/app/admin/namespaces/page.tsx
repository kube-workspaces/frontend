"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/api";
import { useNamespace } from "@/lib/namespace";

interface NamespaceInfo {
  name: string;
  phase: string;
  enabled: boolean;
  labels?: Record<string, string>;
  created_at: string;
}

export default function AdminNamespacesPage() {
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [search, setSearch] = useState("");
  const { refresh: refreshNamespaceDropdown } = useNamespace();

  const fetchNamespaces = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/namespaces`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch namespaces");
      const data = await res.json();
      setNamespaces(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchNamespaces();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [fetchNamespaces]);

  async function toggleNamespace(name: string, enabled: boolean) {
    setToggling(name);
    try {
      const res = await fetch(`${API_BASE}/admin/namespaces/${name}/enabled`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update namespace");
      setNamespaces(prev =>
        prev.map(ns => ns.name === name ? { ...ns, enabled } : ns)
      );
      // Refresh the global namespace dropdown so changes are reflected immediately
      await refreshNamespaceDropdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setToggling(null);
    }
  }

  const filtered = namespaces.filter(ns => {
    if (filter === "enabled" && !ns.enabled) return false;
    if (filter === "disabled" && ns.enabled) return false;
    if (search && !ns.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const enabledCount = namespaces.filter(ns => ns.enabled).length;
  const hasAnyEnabled = enabledCount > 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Namespaces</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {hasAnyEnabled
            ? `${enabledCount} of ${namespaces.length} namespaces enabled for workspaces`
            : `${namespaces.length} namespaces (all visible — enable at least one to activate filtering)`}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search namespaces..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]"
        />
        <div className="flex gap-1">
          {(["all", "enabled", "disabled"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                filter === f
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
          {filtered.length} shown
        </span>
      </div>

      {/* Info callout */}
      {!hasAnyEnabled && !loading && namespaces.length > 0 && (
        <div className="p-3 bg-[var(--color-primary-subtle)] border border-[var(--color-primary)] rounded text-xs text-[var(--color-primary)]">
          No namespaces are enabled yet. All namespaces are currently visible in the namespace selector.
          Enable specific namespaces to restrict which ones appear for users.
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Loading...</div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Phase</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Created</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Labels</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(ns => (
                <tr key={ns.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-gray-900 dark:text-gray-100">{ns.name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium ${
                      ns.phase === "Active"
                        ? "text-green-600 dark:text-green-400"
                        : "text-gray-500 dark:text-gray-400"
                    }`}>
                      {ns.phase}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                    {new Date(ns.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {ns.labels && Object.entries(ns.labels).slice(0, 3).map(([k, v]) => (
                        <span
                          key={k}
                          className="inline-block px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded truncate max-w-[150px]"
                          title={`${k}=${v}`}
                        >
                          {k.split("/").pop()}={v}
                        </span>
                      ))}
                      {ns.labels && Object.keys(ns.labels).length > 3 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          +{Object.keys(ns.labels).length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => toggleNamespace(ns.name, !ns.enabled)}
                      disabled={toggling === ns.name}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)] focus:ring-offset-1 disabled:opacity-50 ${
                        ns.enabled
                          ? "bg-[var(--color-primary)]"
                          : "bg-gray-300 dark:bg-gray-600"
                      }`}
                      title={ns.enabled ? "Disable namespace" : "Enable namespace"}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          ns.enabled ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No namespaces match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
