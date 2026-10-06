"use client";

import { useState } from "react";
import { getWorkspaceInitialCredentials } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function WindowsCredentials({ name, namespace }: { name: string; namespace: string }) {
  const { user, authEnabled, loading } = useAuth();
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (loading || (authEnabled && user?.role !== "admin" && user?.role !== "editor")) return null;
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 p-3 text-xs">
      <p className="font-medium text-gray-900 dark:text-white">Windows initial account</p>
      <p className="mt-1 text-gray-500 dark:text-gray-400">Credentials are unique to this workspace and change after Reset. Use the graphical display to sign in.</p>
      {error && <p role="alert" className="mt-2 text-red-600 dark:text-red-400">{error}</p>}
      {credentials ? (
        <div className="mt-2 space-y-2">
          <p>Username: <span className="font-mono">{credentials.username}</span></p>
          <label className="block">Initial password<input aria-label="Windows initial password" type="text" readOnly value={credentials.password} autoComplete="off" className="mt-1 block w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 p-2 font-mono" /></label>
          <button type="button" onClick={() => setCredentials(null)} className="text-[var(--color-primary)]">Hide credentials</button>
        </div>
      ) : (
        <button type="button" disabled={pending} className="mt-2 text-[var(--color-primary)] disabled:opacity-50" onClick={async () => {
          setPending(true); setError("");
          try { setCredentials(await getWorkspaceInitialCredentials(name, namespace)); }
          catch (err) { setError(err instanceof Error ? err.message : "Initial credentials unavailable"); }
          finally { setPending(false); }
        }}>{pending ? "Loading…" : "Show initial credentials"}</button>
      )}
    </div>
  );
}
