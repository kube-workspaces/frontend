"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createImageRepository } from "@/lib/api";
import RepositoryPathsEditor, { normalizeRepositoryPaths } from "@/components/repository-paths-editor";

export default function NewImageRepositoryPage() {
  const router = useRouter();
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
      await createImageRepository(obj);
      router.push("/admin/imagerepositories");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create image repository");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Add Image Repository</h1>
        <button
          onClick={() => router.push("/admin/imagerepositories")}
          className="px-2 py-1 text-[10px] font-medium rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Back
        </button>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white">Details</h2>
        </div>
        <div className="p-4 space-y-3">
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
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
