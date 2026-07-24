"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/api";

interface UserCR {
  metadata?: { name: string; creationTimestamp?: string };
  spec?: {
    email: string;
    displayName?: string;
    role: string;
    disabled?: boolean;
    groups?: string[];
    namespaceAccess?: Array<{ namespace: string; role: string }>;
  };
  status?: {
    personalNamespace?: string;
    lastLogin?: string;
    loginCount?: number;
  };
}

interface AdminNamespace {
  name: string;
  phase: string;
  enabled: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserCR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", displayName: "", role: "editor" });
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [namespaces, setNamespaces] = useState<AdminNamespace[]>([]);
  const [editAccess, setEditAccess] = useState<Array<{ namespace: string; role: string }>>([]);
  const [saving, setSaving] = useState(false);

  const fetchNamespaces = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/namespaces`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNamespaces(data || []);
      }
    } catch {
      // Non-critical
    }
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to fetch users: ${res.statusText}`);
      const data = await res.json();
      setUsers(data.items || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users`, { credentials: "include" });
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to fetch users: ${res.statusText}`);
        const data = await res.json();
        setUsers(data.items || []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to fetch users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchNamespaces();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [fetchNamespaces]);

  async function handleCreate() {
    if (!createForm.email) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create user");
      }
      setShowCreate(false);
      setCreateForm({ email: "", displayName: "", role: "editor" });
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete user "${name}"? This will also delete their personal namespace.`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${name}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete user");
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    }
  }

  async function handleToggleDisabled(name: string, currentDisabled: boolean) {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !currentDisabled }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update user");
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    }
  }

  function startEditingUser(user: UserCR) {
    setEditingUser(user.metadata?.name || null);
    setEditAccess([...(user.spec?.namespaceAccess || [])]);
  }

  function cancelEditing() {
    setEditingUser(null);
    setEditAccess([]);
  }

  function addAccessEntry() {
    // Pick the first enabled namespace not already in the list
    const enabledNs = namespaces.filter(
      (ns) => ns.enabled && !editAccess.some((e) => e.namespace === ns.name)
    );
    const defaultNs = enabledNs.length > 0 ? enabledNs[0].name : "";
    setEditAccess([...editAccess, { namespace: defaultNs, role: "viewer" }]);
  }

  function removeAccessEntry(idx: number) {
    setEditAccess(editAccess.filter((_, i) => i !== idx));
  }

  function updateAccessEntry(idx: number, field: "namespace" | "role", value: string) {
    const updated = [...editAccess];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditAccess(updated);
  }

  async function saveNamespaceAccess() {
    if (!editingUser) return;
    setSaving(true);
    try {
      // Filter out entries with empty namespace
      const validAccess = editAccess.filter((e) => e.namespace);
      const res = await fetch(`${API_BASE}/admin/users/${editingUser}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespaceAccess: validAccess }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update namespace access");
      setEditingUser(null);
      setEditAccess([]);
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update namespace access");
    } finally {
      setSaving(false);
    }
  }

  const roleColors: Record<string, string> = {
    admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    editor: "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]",
    viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  };

  // Namespaces available for assignment (enabled ones)
  const availableNamespaces = namespaces.filter((ns) => ns.enabled);

  return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Users</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage user accounts and access
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 text-sm font-medium text-[var(--color-primary-foreground)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-md transition-colors"
          >
            Create User
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {showCreate && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">New User</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="email"
                placeholder="Email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                placeholder="Display Name"
                value={createForm.displayName}
                onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.email}
                className="px-3 py-1.5 text-sm font-medium text-[var(--color-primary-foreground)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 rounded transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 dark:text-gray-400">No users found.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Users are auto-provisioned on first login when auth is enabled, or create them manually.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Email</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Role</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Namespaces</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Last Login</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.metadata?.name} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-900/50 align-top">
                    <td className="py-2 px-3 text-gray-900 dark:text-white font-mono text-xs">
                      {user.spec?.email}
                    </td>
                    <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                      {user.spec?.displayName || "-"}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${roleColors[user.spec?.role || "viewer"]}`}>
                        {user.spec?.role}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs">
                      <div className="space-y-0.5">
                        {user.status?.personalNamespace && (
                          <div className="font-mono text-gray-600 dark:text-gray-400">
                            {user.status.personalNamespace}
                            <span className="ml-1 text-gray-400 dark:text-gray-500">(personal)</span>
                          </div>
                        )}
                        {user.spec?.namespaceAccess && user.spec.namespaceAccess.length > 0 && (
                          user.spec.namespaceAccess.map((entry, i) => (
                            <div key={i} className="font-mono text-gray-600 dark:text-gray-400">
                              {entry.namespace}
                              <span className={`ml-1 inline-block px-1 py-0 text-[10px] font-medium rounded ${roleColors[entry.role] || roleColors.viewer}`}>
                                {entry.role}
                              </span>
                            </div>
                          ))
                        )}
                        {!user.status?.personalNamespace && (!user.spec?.namespaceAccess || user.spec.namespaceAccess.length === 0) && (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      {user.spec?.disabled ? (
                        <span className="text-xs text-red-600 dark:text-red-400">Disabled</span>
                      ) : (
                        <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">
                      {user.status?.lastLogin
                        ? new Date(user.status.lastLogin).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEditingUser(user)}
                          className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                        >
                          Namespaces
                        </button>
                        <button
                          onClick={() => handleToggleDisabled(user.metadata!.name, user.spec?.disabled || false)}
                          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                          {user.spec?.disabled ? "Enable" : "Disable"}
                        </button>
                        <button
                          onClick={() => handleDelete(user.metadata!.name)}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Namespace Access Editor Modal */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Namespace Access: {users.find((u) => u.metadata?.name === editingUser)?.spec?.email}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Assign namespaces with viewer or editor access. The user controller will create RoleBindings automatically.
                </p>
              </div>
              <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                {editAccess.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    No shared namespace access configured. Click &quot;Add Namespace&quot; to grant access.
                  </p>
                ) : (
                  editAccess.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={entry.namespace}
                        onChange={(e) => updateAccessEntry(idx, "namespace", e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">Select namespace...</option>
                        {availableNamespaces.map((ns) => (
                          <option key={ns.name} value={ns.name}>{ns.name}</option>
                        ))}
                      </select>
                      <select
                        value={entry.role}
                        onChange={(e) => updateAccessEntry(idx, "role", e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <button
                        onClick={() => removeAccessEntry(idx)}
                        className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 pb-4">
                <button
                  onClick={addAccessEntry}
                  disabled={availableNamespaces.length === 0}
                  className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium disabled:opacity-50"
                >
                  + Add Namespace
                </button>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={cancelEditing}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNamespaceAccess}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 rounded transition-colors"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-xs text-gray-500 dark:text-gray-400">
          <p>Users are managed as <code className="font-mono">User</code> CRDs (<code className="font-mono">users.kubeworkspaces.io</code>). You can also manage them via kubectl:</p>
          <pre className="mt-1 font-mono text-gray-600 dark:text-gray-300">kubectl get users.kubeworkspaces.io</pre>
        </div>
      </div>
  );
}
