"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

interface AuthConfigState {
  enabled: boolean;
  oidc?: {
    issuerURL: string;
    clientID: string;
    scopes?: string[];
    usernameClaim?: string;
    groupsClaim?: string;
  };
  personalNamespaces?: {
    enabled: boolean;
    template: string;
    resourceQuota?: Record<string, string>;
  };
  registration?: {
    autoProvision: boolean;
    defaultRole: string;
    allowedDomains?: string[];
    requireApproval: boolean;
  };
  adminEmails?: string[];
}

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<AuthConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/auth-config`, { credentials: "include" });
        if (cancelled) return;
        if (res.status === 404) {
          setConfig({
            enabled: false,
            personalNamespaces: { enabled: true, template: "{{username}}" },
            registration: { autoProvision: true, defaultRole: "editor", requireApproval: false },
            adminEmails: [],
          });
          setError(null);
          return;
        }
        if (!res.ok) throw new Error(`Failed to fetch config: ${res.statusText}`);
        const data = await res.json();
        setConfig(data.spec || { enabled: false });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to fetch settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/admin/auth-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: config }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }
      setSuccess("Settings saved successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">Loading settings...</div>
    );
  }

  return (
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Auth Settings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Configure authentication, OIDC, and user provisioning
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm font-medium text-[var(--color-primary-foreground)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 rounded-md transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-700 dark:text-green-400">
            {success}
          </div>
        )}

        {config && (
          <div className="space-y-6">
            {/* Master Switch */}
            <section className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-gray-900 dark:text-white">Authentication</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Enable to require users to sign in. When disabled, all access is unauthenticated.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-primary-muted)] rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[var(--color-primary)]"></div>
                </label>
              </div>
            </section>

            {/* OIDC Configuration */}
            <section className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-3">OIDC Provider</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Issuer URL</label>
                  <input
                    type="url"
                    placeholder="https://dex.example.com"
                    value={config.oidc?.issuerURL || ""}
                    onChange={(e) => setConfig({ ...config, oidc: { ...config.oidc, issuerURL: e.target.value, clientID: config.oidc?.clientID || "" } })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Client ID</label>
                  <input
                    type="text"
                    placeholder="kube-workspaces"
                    value={config.oidc?.clientID || ""}
                    onChange={(e) => setConfig({ ...config, oidc: { ...config.oidc, issuerURL: config.oidc?.issuerURL || "", clientID: e.target.value } })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Client secret is stored in a Kubernetes Secret referenced by the AuthConfig CR. Manage it via kubectl.
                </p>
              </div>
            </section>

            {/* Personal Namespaces */}
            <section className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-900 dark:text-white">Personal Namespaces</h2>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.personalNamespaces?.enabled || false}
                    onChange={(e) => setConfig({ ...config, personalNamespaces: { ...config.personalNamespaces, enabled: e.target.checked, template: config.personalNamespaces?.template || "{{username}}" } })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Namespace Template</label>
                <input
                  type="text"
                  placeholder="{{username}}"
                  value={config.personalNamespaces?.template || "{{username}}"}
                  onChange={(e) => setConfig({ ...config, personalNamespaces: { ...config.personalNamespaces, enabled: config.personalNamespaces?.enabled || false, template: e.target.value } })}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Use <code className="font-mono">{"{{username}}"}</code> as placeholder. Examples: <code className="font-mono">{"{{username}}"}</code>, <code className="font-mono">{"user-{{username}}"}</code>, <code className="font-mono">{"ws-{{username}}"}</code>
                </p>
              </div>
            </section>

            {/* Registration */}
            <section className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-3">User Registration</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Auto-provision users</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Create User CR on first login</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.registration?.autoProvision ?? true}
                      onChange={(e) => setConfig({ ...config, registration: { ...config.registration, autoProvision: e.target.checked, defaultRole: config.registration?.defaultRole || "editor", requireApproval: config.registration?.requireApproval || false } })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Default Role</label>
                  <select
                    value={config.registration?.defaultRole || "editor"}
                    onChange={(e) => setConfig({ ...config, registration: { ...config.registration, autoProvision: config.registration?.autoProvision ?? true, defaultRole: e.target.value, requireApproval: config.registration?.requireApproval || false } })}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Require approval</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">New users start disabled until admin approves</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.registration?.requireApproval || false}
                      onChange={(e) => setConfig({ ...config, registration: { ...config.registration, autoProvision: config.registration?.autoProvision ?? true, defaultRole: config.registration?.defaultRole || "editor", requireApproval: e.target.checked } })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                  </label>
                </div>
              </div>
            </section>

            {/* Admin Emails */}
            <section className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Admin Emails</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                These emails always have admin access, regardless of their User CR role. Used for bootstrapping.
              </p>
              <textarea
                value={(config.adminEmails || []).join("\n")}
                onChange={(e) => setConfig({ ...config, adminEmails: e.target.value.split("\n").filter(Boolean) })}
                placeholder="admin@example.com"
                rows={3}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
              />
            </section>
          </div>
        )}

        <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-xs text-gray-500 dark:text-gray-400">
          <p>Auth configuration is stored as an <code className="font-mono">AuthConfig</code> CRD (<code className="font-mono">authconfigs.kubeworkspaces.io</code>). You can also edit via kubectl:</p>
          <pre className="mt-1 font-mono text-gray-600 dark:text-gray-300">kubectl edit authconfig default</pre>
        </div>
      </div>
  );
}
