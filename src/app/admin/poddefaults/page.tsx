"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/api";

interface PodDefault {
  name: string;
  namespace: string;
  description: string;
  selector?: Record<string, string>;
  env_count: number;
  volume_mount_count: number;
  volume_count: number;
  service_account_name?: string;
  annotation_count: number;
  label_count: number;
}

export default function AdminPodDefaultsPage() {
  const [podDefaults, setPodDefaults] = useState<PodDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchPodDefaults = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/poddefaults`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch PodDefaults");
      const data = await res.json();
      setPodDefaults(data);
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
      await fetchPodDefaults();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [fetchPodDefaults]);

  const filtered = podDefaults.filter(pd => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      pd.name.toLowerCase().includes(q) ||
      pd.namespace.toLowerCase().includes(q) ||
      pd.description.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">PodDefaults</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Configuration injected into matching workspace pods at creation time.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, namespace, or description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm">No PodDefaults found.</p>
          <p className="text-xs mt-1">Create PodDefault CRs with <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">kubectl apply</code></p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Namespace</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Description</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Selector</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Injects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(pd => (
                <tr key={`${pd.namespace}/${pd.name}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-2 px-3 font-mono text-xs text-gray-900 dark:text-white">{pd.name}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{pd.namespace}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">{pd.description || "-"}</td>
                  <td className="py-2 px-3">
                    {pd.selector ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(pd.selector).map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-flex px-1.5 py-0.5 text-xs bg-[var(--color-primary-subtle)] text-[var(--color-primary)] rounded"
                          >
                            {k}={v}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 italic">all workspaces</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex justify-center gap-2">
                      {pd.env_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded" title="Environment variables">
                          {pd.env_count} env
                        </span>
                      )}
                      {pd.volume_mount_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded" title="Volume mounts">
                          {pd.volume_mount_count} mnt
                        </span>
                      )}
                      {pd.volume_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded" title="Volumes">
                          {pd.volume_count} vol
                        </span>
                      )}
                      {pd.service_account_name && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded" title="Service account override">
                          SA
                        </span>
                      )}
                      {pd.annotation_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded" title="Annotations">
                          {pd.annotation_count} ann
                        </span>
                      )}
                      {pd.label_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded" title="Labels">
                          {pd.label_count} lbl
                        </span>
                      )}
                      {pd.env_count === 0 && pd.volume_mount_count === 0 && pd.volume_count === 0 && !pd.service_account_name && pd.annotation_count === 0 && pd.label_count === 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
        {filtered.length} PodDefault{filtered.length !== 1 ? "s" : ""} found
      </div>
    </div>
  );
}
