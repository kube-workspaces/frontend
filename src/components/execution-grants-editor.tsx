"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/api";

const permissions = [
  ["workspace.exec", "Run commands and scripts"],
  ["workspace.shell", "Open interactive shells"],
  ["workspace.exec.elevated", "Allow root / SYSTEM targets"],
  ["workspace.execution.manage", "Manage other users’ executions"],
  ["workspace.execution.recordings.read", "Read protected session recordings"],
] as const;

type ExecutionPermission = typeof permissions[number][0];

export interface ExecutionGrant {
  namespace: string;
  workspaces?: string[];
  permissions: ExecutionPermission[];
  expiresAt?: string;
}

interface DraftGrant {
  namespace: string;
  workspaces: string;
  permissions: ExecutionPermission[];
  expiresAt: string;
}

export function ExecutionGrantsEditor({ name, email, initialGrants, onClose, onSaved }: {
  name: string;
  email: string;
  initialGrants: ExecutionGrant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [grants, setGrants] = useState<DraftGrant[]>(() => initialGrants.map((grant) => ({
    namespace: grant.namespace,
    workspaces: (grant.workspaces || []).join(", "),
    permissions: [...grant.permissions],
    expiresAt: grant.expiresAt || "",
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, patch: Partial<DraftGrant>) {
    setGrants((current) => current.map((grant, i) => i === index ? { ...grant, ...patch } : grant));
  }

  async function save() {
    setError(null);
    if (grants.some((grant) => !grant.namespace.trim() || grant.permissions.length === 0)) {
      setError("Every grant needs an exact namespace and at least one permission.");
      return;
    }
    if (grants.some((grant) => grant.expiresAt && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(grant.expiresAt))) {
      setError("Use an RFC3339 expiry with a timezone, for example 2026-12-01T18:00:00Z.");
      return;
    }
    setSaving(true);
    try {
      const executionGrants: ExecutionGrant[] = grants.map((grant) => ({
        namespace: grant.namespace.trim(),
        permissions: grant.permissions,
        ...(grant.workspaces.trim() ? { workspaces: grant.workspaces.trim().split(/[,\s]+/).filter(Boolean) } : {}),
        ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
      }));
      const response = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(name)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionGrants }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save execution grants");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save execution grants");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div role="dialog" aria-modal="true" aria-labelledby="execution-grants-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 id="execution-grants-title" className="text-sm font-semibold text-gray-900 dark:text-white">VM execution access: {email}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Grants apply only within the user’s existing namespace access. Elevation and sensitive recording access are separate permissions.
            Administrators already have these permissions when platform policy permits access.
          </p>
        </div>
        <fieldset disabled={saving} className="p-4 space-y-4 max-h-[65vh] overflow-y-auto disabled:opacity-70">
          {grants.length === 0 && <p className="text-sm text-gray-500">No delegated execution permissions. Save an empty list to revoke all grants.</p>}
          {grants.map((grant, index) => (
            <div key={index} className="p-3 space-y-3 border border-gray-200 dark:border-gray-700 rounded">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-gray-600 dark:text-gray-400">Exact namespace
                  <input value={grant.namespace} onChange={(e) => update(index, { namespace: e.target.value })} className={fieldClass} placeholder="team" />
                </label>
                <label className="text-xs text-gray-600 dark:text-gray-400">Workspace names (blank = whole namespace)
                  <input value={grant.workspaces} onChange={(e) => update(index, { workspaces: e.target.value })} className={fieldClass} placeholder="vm-one, vm-two" />
                </label>
              </div>
              <div className="space-y-1">
                {permissions.map(([permission, label]) => (
                  <label key={permission} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={grant.permissions.includes(permission)} onChange={(e) => update(index, {
                      permissions: e.target.checked ? [...grant.permissions, permission] : grant.permissions.filter((p) => p !== permission),
                    })} />
                    {label}
                  </label>
                ))}
              </div>
              <label className="block text-xs text-gray-600 dark:text-gray-400">Expiry (RFC3339, blank = no grant expiry)
                <input value={grant.expiresAt} onChange={(e) => update(index, { expiresAt: e.target.value })} className={fieldClass} placeholder="2026-12-01T18:00:00Z" />
              </label>
              <button type="button" onClick={() => setGrants(grants.filter((_, i) => i !== index))} className="text-xs text-red-600 dark:text-red-400">Remove grant</button>
            </div>
          ))}
          <button type="button" disabled={grants.length >= 100} onClick={() => setGrants([...grants, { namespace: "", workspaces: "", permissions: [], expiresAt: "" }])} className="text-sm text-[var(--color-primary)] disabled:opacity-50">+ Add grant</button>
        </fieldset>
        {error && <p role="alert" className="px-4 pb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-800">
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="px-3 py-1.5 text-sm rounded bg-[var(--color-primary)] text-[var(--color-primary-foreground)] disabled:opacity-50">{saving ? "Saving…" : "Save grants"}</button>
        </div>
      </div>
    </div>
  );
}
