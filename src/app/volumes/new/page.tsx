"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createVolume, listNamespaces, Namespace } from "@/lib/api";

export default function NewVolumePage() {
  const router = useRouter();
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [namespace, setNamespace] = useState("workspaces");
  const [size, setSize] = useState("5Gi");
  const [storageClass, setStorageClass] = useState("");
  const [accessMode, setAccessMode] = useState("ReadWriteOnce");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const nsData = await listNamespaces();
        setNamespaces(nsData || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load form data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setSubmitting(true);
    setError(null);

    try {
      await createVolume({
        name,
        namespace,
        size,
        storage_class: storageClass || undefined,
        access_mode: accessMode,
      });
      router.push(`/volumes/${name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create volume");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const inputClass = "mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white px-3 py-2 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary-muted)] outline-none transition-colors";

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Create New Volume
      </h1>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3 mb-4">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
          <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} pattern="^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$" maxLength={63} required placeholder="my-data" autoFocus className={inputClass} />
        </div>

        <div>
          <label htmlFor="namespace" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Namespace</label>
          <select id="namespace" value={namespace} onChange={(e) => setNamespace(e.target.value)} className={inputClass}>
            {namespaces.filter((ns) => ns.phase === "Active").map((ns) => (
              <option key={ns.name} value={ns.name}>{ns.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="size" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Size</label>
          <select id="size" value={size} onChange={(e) => setSize(e.target.value)} className={inputClass}>
            <option value="1Gi">1 GiB</option>
            <option value="5Gi">5 GiB</option>
            <option value="10Gi">10 GiB</option>
            <option value="20Gi">20 GiB</option>
            <option value="50Gi">50 GiB</option>
            <option value="100Gi">100 GiB</option>
          </select>
        </div>

        <div>
          <label htmlFor="storageClass" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Storage Class (optional)</label>
          <input type="text" id="storageClass" value={storageClass} onChange={(e) => setStorageClass(e.target.value)} placeholder="Leave empty for default" className={inputClass} />
        </div>

        <div>
          <label htmlFor="accessMode" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Access Mode</label>
          <select id="accessMode" value={accessMode} onChange={(e) => setAccessMode(e.target.value)} className={inputClass}>
            <option value="ReadWriteOnce">ReadWriteOnce</option>
            <option value="ReadWriteMany">ReadWriteMany</option>
            <option value="ReadOnlyMany">ReadOnlyMany</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => router.push("/volumes")} className="px-3 py-1.5 text-xs font-medium rounded border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !name} className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? "Creating..." : "Create Volume"}
          </button>
        </div>
      </form>
    </div>
  );
}
