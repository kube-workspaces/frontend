"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function ChangePasswordPage() {
  const { user, changePassword, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || "Failed to change password");
      return;
    }
    router.push("/");
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-8 shadow-sm">
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Change your password
              </h1>
              {user?.mustChangePassword ? (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  You must set a new password before continuing.
                </p>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Update the password for {user?.email}.
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {error && (
                <div className="p-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                  {error}
                </div>
              )}
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <input
                type="password"
                placeholder="New password (min 12 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--color-primary-foreground)] text-sm font-medium rounded-md transition-colors"
              >
                {submitting ? "Saving..." : "Change password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
