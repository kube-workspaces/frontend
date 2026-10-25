"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listImageRepositories, deleteImageRepository, syncImageRepository } from "@/lib/api";

function get(obj: any, path: string, def: any = "") {
  try {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return def;
      cur = cur[p];
    }
    if (cur == null) return def;
    return cur;
  } catch {
    return def;
  }
}

export default function ImageRepositoriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listImageRepositories();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load image repositories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync(name: string) {
    setSyncing(name);
    try {
      await syncImageRepository(name);
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to trigger sync");
    } finally {
      setSyncing(null);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete ImageRepository ${name}?`)) return;
    try {
      await deleteImageRepository(name);
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to delete image repository");
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
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Paths</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Sync</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Commit</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                  No image repositories found
                </td>
              </tr>
            ) : (
              items.map((item: any) => {
                const name = item?.metadata?.name || "";
                const url = get(item, "spec.url");
                const ref = get(item, "spec.ref", "—");
                const paths = Array.isArray(get(item, "spec.paths")) ? get(item, "spec.paths").join(", ") : get(item, "spec.paths", "images/");
                const lastSync = get(item, "status.lastSyncTime", "—");
                const commit = get(item, "status.lastSyncCommit", "—");
                return (
                  <tr key={name} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white">
                      <Link href={`/admin/imagerepositories/${name}`} className="hover:underline">
                        {name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 max-w-[280px] truncate">{url}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{ref}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{paths}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{lastSync !== "—" ? new Date(lastSync).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-500 dark:text-gray-400">{commit !== "—" && commit.length > 12 ? commit.slice(0, 12) : commit}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSync(name)}
                          disabled={syncing === name}
                          className="px-2 py-1 text-[10px] font-medium rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          {syncing === name ? "Syncing..." : "Sync now"}
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

      {showAddModal && (
        <AddImageRepositoryModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddImageRepositoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    url: "",
    ref: "main",
    paths: "images/",
    authType: "",
    secretName: "",
    syncInterval: "",
    suspend: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const pathsArr = form.paths
        .split(/[\n,]+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const obj: any = {
        apiVersion: "kubeworkspaces.io/v1alpha1",
        kind: "ImageRepository",
        metadata: { name: form.name },
        spec: {
          url: form.url,
          ref: form.ref || undefined,
          paths: pathsArr.length > 0 ? pathsArr : ["images/"],
          suspend: form.suspend,
        },
      };
      if (form.syncInterval) {
        obj.spec.syncInterval = form.syncInterval;
      }
      if (form.authType && form.secretName) {
        obj.spec.auth = {
          type: form.authType,
          secretRef: { name: form.secretName },
        };
      }
      const { createImageRepository } = await import("@/lib/api");
      await createImageRepository(obj);
      onCreated();
    } catch (e: any) {
      setError(e?.message || "Failed to create image repository");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Add Image Repository</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-auto flex-1">
          {error && (
            <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-2">
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name <span className="text-red-500">*</span></label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="image-catalog" className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Repository URL <span className="text-red-500">*</span></label>
            <input type="text" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://github.com/kube-workspaces/image-catalog.git" className={`${inputClass} font-mono`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Ref</label>
              <input type="text" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="main" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sync Interval</label>
              <input type="text" value={form.syncInterval} onChange={(e) => setForm({ ...form, syncInterval: e.target.value })} placeholder="10m" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Paths to scan</label>
            <textarea value={form.paths} onChange={(e) => setForm({ ...form, paths: e.target.value })} rows={2} placeholder="images/" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Auth Type</label>
              <select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value })} className={inputClass}>
                <option value="">None</option>
                <option value="https-basic">HTTPS Basic</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Secret Name</label>
              <input type="text" value={form.secretName} onChange={(e) => setForm({ ...form, secretName: e.target.value })} disabled={!form.authType} placeholder="git-creds" className={`${inputClass} disabled:opacity-50`} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.suspend} onChange={(e) => setForm({ ...form, suspend: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600" />
            Suspend syncing
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.name || !form.url} className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
