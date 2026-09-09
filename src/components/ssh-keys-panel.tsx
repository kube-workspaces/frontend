"use client";

import { useCallback, useEffect, useState } from "react";
import { SshKey, createSshKey, deleteSshKey, listSshKeys } from "@/lib/api";

// slugify turns a user-facing label into a DNS-safe CR name (<=63 chars).
function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 63);
}

export default function SSHKeysPanel() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const items = await listSshKeys();
      setKeys(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list SSH keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listSshKeys()
      .then((items) => {
        if (!cancelled) setKeys(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to list SSH keys");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = async () => {
    const keyName = slugify(name);
    if (!keyName || !publicKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createSshKey({ name: keyName, key_name: name, public_key: publicKey.trim() });
      setName("");
      setPublicKey("");
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add SSH key");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item: SshKey) => {
    setBusy(true);
    setError(null);
    try {
      await deleteSshKey(item.name);
      setKeys((prev) => prev.filter((k) => k.name !== item.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete SSH key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">SSH Keys</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Public keys used to reach the SSH console of VM workspaces. Keys are
          injected into the VM&rsquo;s <code className="text-xs">authorized_keys</code> via
          cloud-init on the next (re)start of the workspace.
        </p>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading SSH keys...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            No SSH keys yet. Add one below to enable SSH to your VMs.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 mb-6">
            {keys.map((item) => (
              <li key={item.name} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {item.key_name || item.name}
                    </span>
                    {item.fingerprint && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                        {item.fingerprint}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
                    {item.public_key}
                  </div>
                  {item.created_at && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Added {item.created_at}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(item)}
                  disabled={busy}
                  className="shrink-0 text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. work laptop"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Public key
            </label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA..."
              rows={4}
              className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] resize-y"
              spellCheck={false}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={busy || !name.trim() || !publicKey.trim()}
            className="px-3 py-2 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add key"}
          </button>
        </div>
      </div>
    </div>
  );
}