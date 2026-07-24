"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { stringify as yamlStringify } from "yaml";
import { getVolume, deleteVolume, listWorkspaces, Volume } from "@/lib/api";
import { useNamespace } from "@/lib/namespace";

export default function VolumeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { namespace: ctxNamespace } = useNamespace();
  const name = params.name as string;

  const [volume, setVolume] = useState<Volume | null>(null);
  const [usedBy, setUsedBy] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<"json" | "yaml">("json");
  const [actionLoading, setActionLoading] = useState(false);

  const namespace = volume?.namespace || ctxNamespace || "workspaces";

  const fetchVolume = useCallback(async () => {
    try {
      const [vol, workspaces] = await Promise.all([
        getVolume(name, namespace),
        listWorkspaces(namespace).catch(() => []),
      ]);
      setVolume(vol);

      const users: string[] = [];
      for (const ws of workspaces) {
        for (const vm of ws.volume_mounts || []) {
          if (vm.name === name) users.push(ws.name);
        }
      }
      setUsedBy(users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch volume");
    } finally {
      setLoading(false);
    }
  }, [name, namespace]);

  const fetchVolumeRef = useRef(fetchVolume);
  useEffect(() => {
    fetchVolumeRef.current = fetchVolume;
  }, [fetchVolume]);

  useEffect(() => {
    if (name) fetchVolumeRef.current();
    const interval = setInterval(() => { if (name) fetchVolumeRef.current(); }, 5000);
    return () => clearInterval(interval);
  }, [name, namespace]);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete volume "${name}"? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await deleteVolume(name, namespace);
      router.push("/volumes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete volume");
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading volume...</div>
      </div>
    );
  }

  if (!volume) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">Volume not found.</p>
        <Link href="/volumes" className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] mt-2 inline-block">
          Back to volumes
        </Link>
      </div>
    );
  }

  const getPhaseBadge = (phase: string) => {
    switch (phase) {
      case "Bound":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Bound
          </span>
        );
      case "Pending":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {phase || "Unknown"}
          </span>
        );
    }
  };

  const rawContent =
    format === "json"
      ? JSON.stringify(volume, null, 2)
      : yamlStringify(volume);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{volume.name}</h1>
              {getPhaseBadge(volume.phase)}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">{volume.namespace}</p>
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={actionLoading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Delete
        </button>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-800 rounded-md p-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white">{volume.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Namespace</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white">{volume.namespace}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Size</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white">{volume.size}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Phase</dt>
            <dd className="mt-0.5">{getPhaseBadge(volume.phase)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Access Mode</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white">{volume.access_mode || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Storage Class</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white">{volume.storage_class || "(default)"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Created</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white">
              {volume.created_at ? new Date(volume.created_at).toLocaleString() : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Used By</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white">
              {usedBy.length > 0 ? usedBy.join(", ") : <span className="text-gray-400 dark:text-gray-500 italic">unused</span>}
            </dd>
          </div>
          {volume.labels && Object.keys(volume.labels).length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Labels</dt>
              <dd className="flex flex-wrap gap-1">
                {Object.entries(volume.labels).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {k}: {v}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="border border-gray-200 dark:border-gray-800 rounded-md">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Raw Object</span>
          <div className="flex items-center gap-0.5 rounded border border-gray-200 dark:border-gray-700 p-0.5">
            {(["json", "yaml"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                  format === f
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <pre className="p-4 overflow-auto text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre max-h-[400px]">
          {rawContent}
        </pre>
      </div>
    </div>
  );
}
