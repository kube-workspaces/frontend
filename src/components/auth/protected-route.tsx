"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, authEnabled, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // If auth is not enabled, allow everything
    if (!authEnabled) return;

    // If not authenticated, redirect to login
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    // If admin required but user is not admin
    if (requireAdmin && !isAdmin) {
      router.push("/");
    }
  }, [loading, authEnabled, isAuthenticated, isAdmin, requireAdmin, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-gray-500 dark:text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  // If auth is not enabled, render children directly
  if (!authEnabled) {
    return <>{children}</>;
  }

  // If not authenticated, show nothing (redirect will happen)
  if (!isAuthenticated) {
    return null;
  }

  // If admin required but user is not admin
  if (requireAdmin && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Access Denied</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            You need admin privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
