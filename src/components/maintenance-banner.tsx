"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/api";

export function MaintenanceBanner() {
  const { isAdmin } = useAuth();
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await getPlatformConfig();
        if (!cancelled) {
          setMaintenance(config.maintenance);
        }
      } catch {
        // Platform config not available, assume no maintenance
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!maintenance?.enabled) return null;

  const message = maintenance.message || "The platform is currently undergoing maintenance. Please try again later.";

  // Admins see a subtle warning banner
  if (isAdmin) {
    return (
      <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg flex items-center gap-2">
        <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="flex-1">
          <span className="text-xs font-medium text-orange-800 dark:text-orange-300">Maintenance mode is active</span>
          <span className="text-xs text-orange-600 dark:text-orange-400 ml-2">{message}</span>
        </div>
        <span className="text-[10px] text-orange-500 dark:text-orange-400 font-medium px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 rounded">Admin bypass</span>
      </div>
    );
  }

  // Non-admin users see a prominent maintenance message
  return (
    <div className="mb-4 p-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-center">
      <svg className="w-8 h-8 text-orange-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384-5.383a8.025 8.025 0 010-11.357l5.384 5.384a8.025 8.025 0 010 11.356zM14.58 8.83l5.384 5.383a8.025 8.025 0 010 11.357l-5.384-5.384a8.025 8.025 0 010-11.356z" />
      </svg>
      <h2 className="text-lg font-semibold text-orange-800 dark:text-orange-300 mb-2">Maintenance Mode</h2>
      <p className="text-sm text-orange-700 dark:text-orange-400">{message}</p>
    </div>
  );
}
