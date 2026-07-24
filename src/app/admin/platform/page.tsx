"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

interface FormFieldLockState {
  field: string;
  value: string;
  message: string;
}

interface PlatformConfigState {
  maintenance?: {
    enabled: boolean;
    message: string;
  };
  form?: {
    lockedFields?: FormFieldLockState[];
  };
}

export default function AdminPlatformPage() {
  const [config, setConfig] = useState<PlatformConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/platform-config`, { credentials: "include" });
        if (cancelled) return;
        if (res.status === 404) {
          setConfig({
            maintenance: { enabled: false, message: "" },
            form: { lockedFields: [] },
          });
          setError(null);
          return;
        }
        if (!res.ok) throw new Error(`Failed to fetch config: ${res.statusText}`);
        const data = await res.json();
        setConfig(data.spec || { maintenance: { enabled: false, message: "" } });
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
      const res = await fetch(`${API_BASE}/admin/platform-config`, {
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
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Platform Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure maintenance mode, form field locks, and other platform-wide settings
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
          {/* Maintenance Mode */}
          <section className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-medium text-gray-900 dark:text-white">Maintenance Mode</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  When enabled, non-admin users see a maintenance page and cannot create or manage workspaces.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.maintenance?.enabled || false}
                  onChange={(e) => setConfig({ ...config, maintenance: { ...config.maintenance, enabled: e.target.checked, message: config.maintenance?.message || "" } })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-primary-muted)] rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500"></div>
              </label>
            </div>
            {config.maintenance?.enabled && (
              <div className="mt-3 p-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded text-xs text-orange-700 dark:text-orange-400">
                Maintenance mode is active. Non-admin users will see the maintenance message and cannot access the platform.
              </div>
            )}
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Maintenance Message</label>
              <textarea
                value={config.maintenance?.message || ""}
                onChange={(e) => setConfig({ ...config, maintenance: { ...config.maintenance, enabled: config.maintenance?.enabled || false, message: e.target.value } })}
                placeholder="The platform is currently undergoing maintenance. Please try again later."
                rows={3}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Displayed to users when maintenance mode is active. Leave empty for a default message.
              </p>
            </div>
          </section>

          {/* Form Field Locks */}
          <section className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-medium text-gray-900 dark:text-white">Form Field Locks</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Lock workspace creation form fields to enforced values. Non-admin users cannot override locked fields.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const locks = config.form?.lockedFields || [];
                  setConfig({ ...config, form: { ...config.form, lockedFields: [...locks, { field: "", value: "", message: "" }] } });
                }}
                className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium"
              >
                + Add Lock
              </button>
            </div>
            {(config.form?.lockedFields || []).length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">No locked fields. All form fields are editable by users.</p>
            )}
            {(config.form?.lockedFields || []).map((lock, index) => (
              <div key={index} className="flex gap-2 mb-2 items-start">
                <div className="flex-1">
                  <select
                    value={lock.field}
                    onChange={(e) => {
                      const locks = [...(config.form?.lockedFields || [])];
                      locks[index] = { ...locks[index], field: e.target.value };
                      setConfig({ ...config, form: { ...config.form, lockedFields: locks } });
                    }}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Select field...</option>
                    <option value="cpu_request">CPU Request</option>
                    <option value="memory_request">Memory Request</option>
                    <option value="cpu_limit">CPU Limit</option>
                    <option value="memory_limit">Memory Limit</option>
                    <option value="gpu">GPU (toggle)</option>
                    <option value="shared_memory">Shared Memory (toggle)</option>
                    <option value="image_pull_policy">Image Pull Policy</option>
                    <option value="scheduling">Scheduling</option>
                  </select>
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={lock.value}
                    onChange={(e) => {
                      const locks = [...(config.form?.lockedFields || [])];
                      locks[index] = { ...locks[index], value: e.target.value };
                      setConfig({ ...config, form: { ...config.form, lockedFields: locks } });
                    }}
                    placeholder="Enforced value"
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={lock.message}
                    onChange={(e) => {
                      const locks = [...(config.form?.lockedFields || [])];
                      locks[index] = { ...locks[index], message: e.target.value };
                      setConfig({ ...config, form: { ...config.form, lockedFields: locks } });
                    }}
                    placeholder="Hint message (optional)"
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const locks = (config.form?.lockedFields || []).filter((_, i) => i !== index);
                    setConfig({ ...config, form: { ...config.form, lockedFields: locks } });
                  }}
                  className="text-xs text-red-500 hover:text-red-700 px-1 py-1.5"
                >
                  &times;
                </button>
              </div>
            ))}
            {(config.form?.lockedFields || []).length > 0 && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                Field: the form field to lock. Value: the enforced value (e.g. &quot;500m&quot;, &quot;true&quot;/&quot;false&quot;, &quot;Always&quot;). Message: optional tooltip for users.
              </p>
            )}
          </section>
        </div>
      )}

      <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-xs text-gray-500 dark:text-gray-400">
        <p>Platform configuration is stored as a <code className="font-mono">PlatformConfig</code> CRD (<code className="font-mono">platformconfigs.kubeworkspaces.io</code>). You can also edit via kubectl:</p>
        <pre className="mt-1 font-mono text-gray-600 dark:text-gray-300">kubectl edit platformconfig default</pre>
      </div>
    </div>
  );
}
