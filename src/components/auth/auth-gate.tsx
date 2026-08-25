"use client";

import { useAuth } from "@/lib/auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, authEnabled, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!authEnabled) return;
    if (isAuthenticated) return;
    if (pathname === "/login") return;

    router.push("/login");
  }, [loading, authEnabled, isAuthenticated, pathname, router]);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) return;
    if (!user?.mustChangePassword) return;
    if (pathname === "/change-password") return;

    router.push("/change-password");
  }, [loading, isAuthenticated, user, pathname, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (authEnabled && !isAuthenticated && pathname !== "/login") {
    return null;
  }

  if (isAuthenticated && user?.mustChangePassword && pathname !== "/change-password") {
    return null;
  }

  return <>{children}</>;
}
