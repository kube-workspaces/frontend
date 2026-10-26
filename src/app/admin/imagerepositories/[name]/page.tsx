"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getImageRepository, updateImageRepository, deleteImageRepository, syncImageRepository } from "@/lib/api";
import RepositoryPathsEditor, { normalizeRepositoryPaths } from "@/components/repository-paths-editor";

interface ImageRepository {
  apiVersion?: string;
  kind?: string;
  metadata?: { name: string };
  spec?: {
    url?: string;
    ref?: string;
    paths?: string[];
    auth?: { type?: string; secretRef?: { name?: string } };
    syncInterval?: string;
    suspend?: boolean;
  };
  status?: {
    lastSyncTime?: string;
    lastSyncCommit?: string;
    importedImages?: string[];
    observedGeneration?: number;
    conditions?: Array<{ type: string; status: string; reason?: string; message?: string }>;
  };
}

export default function ImageRepositoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const name = params.name as string;
  const [obj, setObj] = useState<ImageRepository | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    url: "",
    ref: "main",
    paths: ["images"],
    authType: "",
    secretName: "",
    syncInterval: "",
    suspend: false,
  });

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = (await getImageRepository(name)) as ImageRepository;
        if (!cancelled) {
          setObj(data);
          const paths = data.spec?.paths?.length ? data.spec.paths : ["images"];
          setForm({
            url: data.spec?.url || "",
            ref: data.spec?.ref || "main",
            paths,
            authType: data.spec?.auth?.type || "",
            secretName: data.spec?.auth?.secretRef?.name || "",
            syncInterval: data.spec?.syncInterval || "",
            suspend: !!data.spec?.suspend,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load image repository");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Refresh asynchronous sync status without replacing unsaved form edits.
  useEffect(() => {
    if (!name || saving || syncing) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const data = (await getImageRepository(name)) as ImageRepository;
        if (!cancelled) setObj(data);
      } catch {
        // Keep the last known status; explicit load/save/sync reports errors.
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [name, saving, syncing]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const pathsArr = normalizeRepositoryPaths(form.paths);
      const updated: ImageRepository = JSON.parse(JSON.stringify(obj || {}));
      updated.apiVersion = updated.apiVersion || "kubeworkspaces.io/v1alpha1";
      updated.kind = updated.kind || "ImageRepository";
      updated.metadata = updated.metadata || { name };
      updated.metadata.name = name;
      updated.spec = updated.spec || {};
      updated.spec.url = form.url;
      updated.spec.ref = form.ref || "main";
      updated.spec.paths = pathsArr;
      updated.spec.suspend = form.suspend;
      if (form.syncInterval) {
        updated.spec.syncInterval = form.syncInterval;
      } else {
        delete updated.spec.syncInterval;
      }
      if (form.authType && form.secretName) {
        updated.spec.auth = { type: form.authType, secretRef: { name: form.secretName } };
      } else {
        delete updated.spec.auth;
      }
      await updateImageRepository(name, updated);
      // reload
      const data = (await getImageRepository(name)) as ImageRepository;
      setObj(data);
      setForm((current) => ({ ...current, paths: data.spec?.paths?.length ? data.spec.paths : ["images"] }));
      alert("Saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save image repository");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await syncImageRepository(name);
      const data = (await getImageRepository(name)) as ImageRepository;
      setObj(data);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to trigger sync");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ImageRepository ${name}?`)) return;
    try {
      await deleteImageRepository(name);
      router.push("/admin/imagerepositories");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete image repository");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const imported = Array.isArray(obj?.status?.importedImages) ? obj.status.importedImages : [];
  const lastSync = obj?.status?.lastSyncTime;
  const lastCommit = obj?.status?.lastSyncCommit || "—";
  const conditions = Array.isArray(obj?.status?.conditions) ? obj.status.conditions : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">ImageRepository: {name}</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Syncing..." : "Sync now"}
          </button>
          <button
            onClick={() => router.push("/admin/imagerepositories")}
            className="px-2 py-1 text-[10px] font-medium rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleDelete}
            className="px-2 py-1 text-[10px] font-medium rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={handleSave} className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-medium text-gray-900 dark:text-white">Spec</h2>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label htmlFor="repository-url" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Repository URL</label>
              <input
                id="repository-url"
                type="text"
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
                  type="text"
                  value={form.ref}
                  onChange={(e) => setForm({ ...form, ref: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="repository-interval" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sync Interval</label>
                <input
                  id="repository-interval"
                  type="text"
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
                  <option value="https-basic">HTTPS basic / token (https-basic)</option>
                </select>
              </div>
              <div>
                <label htmlFor="repository-secret" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Secret Name</label>
                <input
                  id="repository-secret"
                  type="text"
                  value={form.secretName}
                  onChange={(e) => setForm({ ...form, secretName: e.target.value })}
                  disabled={!form.authType}
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.suspend}
                onChange={(e) => setForm({ ...form, suspend: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Suspend
            </label>
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-4">
          <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">Status</h2>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Last Sync</span>
                <span className="text-gray-900 dark:text-white">{lastSync ? new Date(lastSync).toLocaleString() : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Last Commit</span>
                <span className="font-mono text-xs text-gray-900 dark:text-white truncate max-w-[200px]">{lastCommit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Observed Generation</span>
                <span className="text-gray-900 dark:text-white">{obj?.status?.observedGeneration ?? "—"}</span>
              </div>
              {conditions.map((c, idx) => (
                <div key={idx}>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{c.type}</span>
                    <span className={c.status === "True" ? "text-green-600 dark:text-green-400" : "text-gray-900 dark:text-white"}>
                      {c.status} {c.reason ? `(${c.reason})` : ""}
                    </span>
                  </div>
                  {c.message && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">{c.message}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">Imported Images ({imported.length})</h2>
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {imported.length === 0 ? (
                    <tr>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">None</td>
                    </tr>
                  ) : (
                    imported.map((img) => (
                      <tr key={img} className="hover:bg-gray-50 dark:hover:bg-white/5">
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{img}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
