"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listImageRepositories, syncImageRepository, deleteImageRepository } from "@/lib/api";
import RepositoryPathsEditor, { normalizeRepositoryPaths } from "@/components/repository-paths-editor";

interface ImageRepository {
  metadata?: { name: string };
  spec?: { url?: string; ref?: string; paths?: string[]; suspend?: boolean };
  status?: {
    lastSyncTime?: string;
    lastSyncCommit?: string;
    importedImages?: string[];
    conditions?: Array<{ type: string; status: string; reason?: string; message?: string }>;
  };
}

function getReadyStatus(repo: ImageRepository) {
  const conditions = repo.status?.conditions || [];
  const ready = conditions.find((c) => c.type === "Ready");
  if (ready) {
    if (ready.status === "True") return { text: "Ready", color: "text-green-600 dark:text-green-400" };
    if (ready.status === "False") return { text: ready.reason || "NotReady", color: "text-red-600 dark:text-red-400" };
  }
  return { text: "Unknown", color: "text-gray-500 dark:text-gray-400" };
}

export default function ImageRepositoriesPage() {
  const [repos, setRepos] = useState<ImageRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(quiet = false) {
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const data = (await listImageRepositories()) as ImageRepository[];
        if (!cancelled) {
          setRepos(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load image repositories");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    const timer = setInterval(() => load(true), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function refresh() {
    try {
      const data = (await listImageRepositories()) as ImageRepository[];
      setRepos(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load image repositories");
    }
  }

  async function handleSync(name: string) {
    setSyncing(name);
    try {
      await syncImageRepository(name);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to trigger sync");
    } finally {
      setSyncing(null);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete ImageRepository ${name}?`)) return;
    try {
      await deleteImageRepository(name);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete image repository");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading image repositories...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Image Repositories</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
        >
          + Add Image Repository
        </button>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">URL</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ref</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Sync</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Images</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {repos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  No image repositories found
                </td>
              </tr>
            ) : (
              repos.map((repo) => {
                const name = repo.metadata?.name || "";
                const status = getReadyStatus(repo);
                const lastSync = repo.status?.lastSyncTime;
                const count = Array.isArray(repo.status?.importedImages) ? repo.status?.importedImages.length : 0;
                return (
                  <tr key={name} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white">
                      <Link href={`/admin/imagerepositories/${name}`} className="hover:underline">
                        {name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-500 dark:text-gray-400 max-w-[280px] truncate">{repo.spec?.url}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{repo.spec?.ref || "main"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className={status.color}>{status.text}</span>
                      {repo.status?.conditions?.find((c) => c.type === "Ready")?.message && (
                        <p className="mt-1 max-w-xs text-gray-500 dark:text-gray-400 break-words">
                          {repo.status.conditions.find((c) => c.type === "Ready")?.message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                      {lastSync ? new Date(lastSync).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{count}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSync(name)}
                          disabled={syncing === name}
                          className="px-2 py-1 text-[10px] font-medium rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                        >
                          {syncing === name ? "Syncing..." : "Sync"}
                        </button>
                        <Link
                          href={`/admin/imagerepositories/${name}`}
                          className="px-2 py-1 text-[10px] font-medium rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(name)}
                          className="px-2 py-1 text-[10px] font-medium rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && <AddImageRepositoryModal onClose={() => setShowAddModal(false)} onCreated={refresh} />}
    </div>
  );
}

function AddImageRepositoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    url: "",
    ref: "main",
    paths: ["images"],
    authType: "",
    secretName: "",
    syncInterval: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const pathsArr = normalizeRepositoryPaths(form.paths);
      const obj: Record<string, unknown> = {
        apiVersion: "kubeworkspaces.io/v1alpha1",
        kind: "ImageRepository",
        metadata: { name: form.name },
        spec: {
          url: form.url,
          ref: form.ref || "main",
          paths: pathsArr,
        },
      };
      if (form.syncInterval) {
        (obj.spec as Record<string, unknown>).syncInterval = form.syncInterval;
      }
      if (form.authType && form.secretName) {
        (obj.spec as Record<string, unknown>).auth = { type: form.authType, secretRef: { name: form.secretName } };
      }
      const { createImageRepository } = await import("@/lib/api");
      await createImageRepository(obj);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create image repository");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-950 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800 shadow-xl">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Add Image Repository</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
          <div>
            <label htmlFor="repository-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              id="repository-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="repository-url" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Repository URL</label>
            <input
              id="repository-url"
              required
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="repository-ref" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Ref</label>
              <input
                id="repository-ref"
                value={form.ref}
                onChange={(e) => setForm({ ...form, ref: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="repository-interval" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sync Interval</label>
              <input
                id="repository-interval"
                value={form.syncInterval}
                onChange={(e) => setForm({ ...form, syncInterval: e.target.value })}
                placeholder="10m"
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <RepositoryPathsEditor paths={form.paths} onChange={(paths) => setForm({ ...form, paths })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="repository-auth" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Auth Type</label>
              <select
                id="repository-auth"
                value={form.authType}
                onChange={(e) => setForm({ ...form, authType: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
              >
                <option value="">None</option>
                <option value="basic">HTTPS basic / token</option>
              </select>
            </div>
            <div>
              <label htmlFor="repository-secret" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Secret Name</label>
              <input
                id="repository-secret"
                value={form.secretName}
                onChange={(e) => setForm({ ...form, secretName: e.target.value })}
                disabled={!form.authType}
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white disabled:opacity-50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
