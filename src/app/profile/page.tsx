"use client";

import { useAuth } from "@/lib/auth";
import { useNamespace } from "@/lib/namespace";
import { UserAvatar } from "@/components/user-avatar";
import SSHKeysPanel from "@/components/ssh-keys-panel";
import Link from "next/link";

export default function ProfilePage() {
  const { user, authConfig, isAdmin } = useAuth();
  const { namespace, setNamespace } = useNamespace();

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Not signed in.</p>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    editor: "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]",
    viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Profile</h1>

      {/* User Info Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm mb-6">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <UserAvatar
              avatarURL={user.avatarURL}
              displayName={user.displayName}
              email={user.email}
              size="lg"
              className="shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white truncate">
                {user.displayName || user.email}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
              <div className="mt-2">
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${roleColors[user.role || "viewer"]}`}>
                  {user.role}
                </span>
              </div>
            </div>
          </div>
        </div>
        {authConfig?.localAuth?.enabled && (
          <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800">
            <Link
              href="/change-password"
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              Change password
            </Link>
          </div>
        )}
      </div>

      {/* Namespace Info */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm mb-6">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Namespaces</h3>
        </div>
        <div className="p-6 space-y-4">
          {user.personalNamespace && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Personal namespace</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-gray-900 dark:text-gray-100">
                  {user.personalNamespace}
                </code>
                {namespace !== user.personalNamespace && (
                  <button
                    onClick={() => setNamespace(user.personalNamespace!)}
                    className="text-xs text-[var(--color-primary)] hover:underline"
                  >
                    Switch to this
                  </button>
                )}
                {namespace === user.personalNamespace && (
                  <span className="text-xs text-green-600 dark:text-green-400">(active)</span>
                )}
              </div>
            </div>
          )}

          {user.namespaces && user.namespaces.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Accessible namespaces</p>
              <div className="flex flex-wrap gap-2">
                {user.namespaces.map(ns => (
                  <button
                    key={ns}
                    onClick={() => setNamespace(ns)}
                    className={`inline-flex items-center px-2 py-1 text-xs font-mono rounded border transition-colors ${
                      namespace === ns
                        ? "bg-[var(--color-primary-subtle)] border-[var(--color-primary)] text-[var(--color-primary)]"
                        : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    {ns}
                    {namespace === ns && (
                      <svg className="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SSH Keys */}
      <SSHKeysPanel />

      {/* Groups */}
      {user.groups && user.groups.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Groups</h3>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-2">
              {user.groups.map(group => (
                <span
                  key={group}
                  className="inline-block px-2 py-1 text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded"
                >
                  {group}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Auth Config Summary */}
      {authConfig && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Authentication</h3>
          </div>
          <div className="p-6">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Auth enabled</dt>
                <dd className="text-gray-900 dark:text-gray-100">{authConfig.enabled ? "Yes" : "No"}</dd>
              </div>
              {authConfig.personalNamespaces && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Personal namespaces</dt>
                  <dd className="text-gray-900 dark:text-gray-100">
                    {authConfig.personalNamespaces.enabled ? "Enabled" : "Disabled"}
                  </dd>
                </div>
              )}
              {isAdmin && authConfig.issuerURL && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">OIDC issuer</dt>
                  <dd className="text-gray-900 dark:text-gray-100 font-mono text-xs truncate max-w-[200px]" title={authConfig.issuerURL}>
                    {authConfig.issuerURL}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
