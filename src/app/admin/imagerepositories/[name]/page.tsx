"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getImageRepository, updateImageRepository, deleteImageRepository, syncImageRepository } from "@/lib/api";

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

export default function ImageRepositoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const name = params.name as string;
  const [obj, setObj] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    url: "",
    ref: "",
    paths: "images/",
    authType: "",
    secretName: "",
    syncInterval: "",
    suspend: false,
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data: any = await getImageRepository(name);
      setObj(data);
      setForm({
        url: get(data, "spec.url", ""),
        ref: get(data, "spec.ref", ""),
        paths: Array.isArray(get(data, "spec.paths")) ? get(data, "spec.paths").join(", ") : get(data, "spec.paths", "images/"),
        authType: get(data, "spec.auth.type", ""),
        secretName: get(data, "spec.auth.secretRef.name", ""),
        syncInterval: get(data, "spec.syncInterval", "") || "",
        suspend: !!get(data, "spec.suspend", false),
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load image repository");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (name) load();
  }, [name]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const pathsArr = form.paths
        .split(/[\n,]+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const updated: any = JSON.parse(JSON.stringify(obj || {}));
      updated.apiVersion = updated.apiVersion || "kubeworkspaces.io/v1alpha1";
      updated.kind = updated.kind || "ImageRepository";
      updated.metadata = updated.metadata || { name };
      updated.metadata.name = name;
      updated.spec = updated.spec || {};
      updated.spec.url = form.url;
      updated.spec.ref = form.ref || undefined;
      updated.spec.paths = pathsArr.length > 0 ? pathsArr : ["images/"];
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
      await load();
      alert("Saved");
    } catch (e: any) {
      setError(e?.message || "Failed to save image repository");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await syncImageRepository(name);
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to trigger sync");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ImageRepository ${name}?`)) return;
    try {
      await deleteImageRepository(name);
      router.push("/admin/imagerepositories");
    } catch (e: any) {
      alert(e?.message || "Failed to delete image repository");
    }
  }

  if (loading) {
    return <div className="text-sm text-[var(--text-secondary)]">Loading...</div>;
  }

  const imported = Array.isArray(get(obj, "status.importedImages")) ? get(obj, "status.importedImages") : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">ImageRepository: {name}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Manage and sync this repository</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--accent-primary)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync now"}
          </button>
          <Link href="/admin/imagerepositories" className="px-4 py-2 text-sm font-medium rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
            Back
          </Link>
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium rounded-md border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSave} className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">Spec</h2>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Repository URL</label>
            <input
              type="text"
              required
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Ref</label>
              <input
                type="text"
                value={form.ref}
                onChange={(e) => setForm({ ...form, ref: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Sync Interval</label>
              <input
                type="text"
                value={form.syncInterval}
                onChange={(e) => setForm({ ...form, syncInterval: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                placeholder="10m"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Paths</label>
            <textarea
              value={form.paths}
              onChange={(e) => setForm({ ...form, paths: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Auth Type</label>
              <select
                value={form.authType}
                onChange={(e) => setForm({ ...form, authType: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
              >
                <option value="">None</option>
                <option value="https-basic">HTTPS Basic</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Secret Name</label>
              <input
                type="text"
                value={form.secretName}
                onChange={(e) => setForm({ ...form, secretName: e.target.value })}
                disabled={!form.authType}
                className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] disabled:opacity-50"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={form.suspend}
              onChange={(e) => setForm({ ...form, suspend: e.target.checked })}
            />
            Suspend syncing
          </label>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--accent-primary)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>

        <div className="space-y-6">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-6 space-y-3">
            <h2 className="text-lg font-medium text-[var(--text-primary)]">Status</h2>
            <div className="text-sm text-[var(--text-secondary)] space-y-1">
              <div><span className="text-[var(--text-primary)]">Last Sync:</span> {get(obj, "status.lastSyncTime") ? new Date(get(obj, "status.lastSyncTime")).toLocaleString() : "—"}</div>
              <div><span className="text-[var(--text-primary)]">Last Commit:</span> <span className="font-mono">{get(obj, "status.lastSyncCommit", "—")}</span></div>
              <div><span className="text-[var(--text-primary)]">Observed Generation:</span> {get(obj, "status.observedGeneration", "—")}</div>
            </div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-6 space-y-3">
            <h2 className="text-lg font-medium text-[var(--text-primary)]">Imported Images</h2>
            {imported.length === 0 ? (
              <div className="text-sm text-[var(--text-secondary)]">None</div>
            ) : (
              <ul className="space-y-1">
                {imported.map((img: string) => (
                  <li key={img}>
                    <Link href={`/admin/images?name=${encodeURIComponent(img)}`} className="text-sm text-[var(--accent-primary)] hover:underline">
                      {img}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
