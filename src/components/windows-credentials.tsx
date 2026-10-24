"use client";

import { useState } from "react";
import { getWorkspaceInitialCredentials } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function WindowsCredentials({ name, namespace }: { name: string; namespace: string }) {
  const { user, authEnabled, loading } = useAuth();
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  if (loading || (authEnabled && user?.role !== "admin" && user?.role !== "editor")) return null;
  const copyPassword = async () => {
    if (!credentials?.password) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 p-3 text-xs">
      <p className="font-medium text-gray-900 dark:text-white">Windows initial account</p>
      <p className="mt-1 text-gray-500 dark:text-gray-400">Credentials are unique to this workspace and change after Reset. Use the graphical display to sign in.</p>
      {error && <p role="alert" className="mt-2 text-red-600 dark:text-red-400">{error}</p>}
      {credentials ? (
        <div className="mt-2 space-y-2">
          <p>Username: <span className="font-mono">{credentials.username}</span></p>
          <label className="block">Initial password
            <div className="mt-1 flex items-center gap-2">
              <input aria-label="Windows initial password" type="text" readOnly value={credentials.password} autoComplete="off" className="block w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 p-2 font-mono" />
              <button
                type="button"
                onClick={copyPassword}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                title="Copy password to clipboard"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </label>
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
