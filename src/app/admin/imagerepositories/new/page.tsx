"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createImageRepository } from "@/lib/api";

export default function NewImageRepositoryPage() {
  const router = useRouter();
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await createImageRepository(obj);
      router.push("/admin/imagerepositories");
    } catch (e: any) {
      setError(e?.message || "Failed to create image repository");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Add Image Repository</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Create a new ImageRepository to sync Image CRs from git
          </p>
        </div>
        <Link href="/admin/imagerepositories" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Back to list
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
            placeholder="image-catalog"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Repository URL</label>
          <input
            type="text"
            required
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
            placeholder="https://github.com/kube-workspaces/image-catalog.git"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Ref (branch/tag/commit)</label>
            <input
              type="text"
              value={form.ref}
              onChange={(e) => setForm({ ...form, ref: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
              placeholder="main"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Sync Interval (optional)</label>
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
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Paths to scan (comma or newline separated)</label>
          <textarea
            value={form.paths}
            onChange={(e) => setForm({ ...form, paths: e.target.value })}
            className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
            rows={3}
            placeholder="images/"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Auth Type (optional)</label>
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
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Secret Name (optional)</label>
            <input
              type="text"
              value={form.secretName}
              onChange={(e) => setForm({ ...form, secretName: e.target.value })}
              disabled={!form.authType}
              className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] disabled:opacity-50"
              placeholder="git-creds"
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
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--accent-primary)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create"}
          </button>
          <Link
            href="/admin/imagerepositories"
            className="px-4 py-2 text-sm font-medium rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-secondary)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
