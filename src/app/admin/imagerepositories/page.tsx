"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Image Repositories</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Git repositories containing Image CR manifests to sync into the cluster
          </p>
        </div>
        <Link
          href="/admin/imagerepositories/new"
          className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--accent-primary)] text-white hover:opacity-90"
        >
          Add Image Repository
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-6 py-3">Name</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-6 py-3">URL</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-6 py-3">Ref</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-6 py-3">Paths</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-6 py-3">Last Sync</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-6 py-3">Commit</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">
                    Loading...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">
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
                    <tr key={name} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-primary)]">
                      <td className="px-6 py-4 text-sm font-medium text-[var(--text-primary)]">
                        <Link href={`/admin/imagerepositories/${name}`} className="hover:underline">
                          {name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--text-secondary)] max-w-xs truncate">{url}</td>
                      <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{ref}</td>
                      <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{paths}</td>
                      <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{lastSync !== "—" ? new Date(lastSync).toLocaleString() : "—"}</td>
                      <td className="px-6 py-4 text-sm text-[var(--text-secondary)] font-mono text-xs">{commit !== "—" && commit.length > 12 ? commit.slice(0, 12) : commit}</td>
                      <td className="px-6 py-4 text-right text-sm space-x-2">
                        <button
                          onClick={() => handleSync(name)}
                          disabled={syncing === name}
                          className="px-3 py-1 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                        >
                          {syncing === name ? "Syncing..." : "Sync now"}
                        </button>
                        <Link
                          href={`/admin/imagerepositories/${name}`}
                          className="px-3 py-1 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-secondary)]"
                        >
                          Edit/View
                        </Link>
                        <button
                          onClick={() => handleDelete(name)}
                          className="px-3 py-1 rounded-md border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
