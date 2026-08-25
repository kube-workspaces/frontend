"use client";

import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { login, loginLocal, isAuthenticated, authEnabled, authConfig, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push("/");
    }
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (!loading && !authEnabled) {
      router.push("/");
    }
  }, [loading, authEnabled, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const localAuthEnabled = authConfig?.localAuth?.enabled ?? false;
  const ssoEnabled = !!authConfig?.issuerURL;

  async function handleLocalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    setError(null);
    const result = await loginLocal(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || "Invalid email or password");
      return;
    }
    if (result.mustChangePassword) {
      router.push("/change-password");
    } else {
      router.push("/");
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-8 shadow-sm">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-2">
              <svg className="w-8 h-8 text-[var(--color-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Kube Workspaces
              </h1>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Sign in to access your workspaces
            </p>

            {localAuthEnabled && (
              <form onSubmit={handleLocalSubmit} className="w-full flex flex-col gap-3">
                {error && (
                  <div className="p-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    {error}
                  </div>
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={submitting || !email || !password}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--color-primary-foreground)] text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]"
                >
                  {submitting ? "Signing in..." : "Sign in"}
                </button>
              </form>
            )}

            {localAuthEnabled && ssoEnabled && (
              <div className="w-full flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              </div>
            )}

            {ssoEnabled && (
              <button
                onClick={login}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Sign in with SSO
              </button>
            )}

            {ssoEnabled && (
              <p className="text-xs text-gray-500 dark:text-gray-500">
                You will be redirected to your identity provider
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
