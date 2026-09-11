"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE, PlatformComponent, Workspace } from "@/lib/api";
import { Badge } from "@/components/ui";

interface DashboardStats {
  users: { total: number; active: number; disabled: number; admins: number } | null;
  authEnabled: boolean | null;
  images: number | null;
  workspaces: {
    total: number;
    running: number;
    stopped: number;
    starting: number;
    error: number;
  } | null;
  components: Record<string, PlatformComponent> | null;
}

function getWorkspaceStatus(ws: Workspace): "running" | "stopped" | "starting" | "error" {
  if (ws.stopped) return "stopped";
  if (ws.ready_replicas > 0) return "running";
  const cs = ws.container_state;
  if (cs?.state === "waiting" && cs?.reason && ["Pending", "Unschedulable", "CreateContainerConfigError", "ImagePullBackOff", "CrashLoopBackOff"].includes(cs.reason)) {
    return "error";
  }
  return "starting";
}

export default function AdminPage() {
  const [stats, setStats] = useState<DashboardStats>({
    users: null,
    authEnabled: null,
    images: null,
    workspaces: null,
    components: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const results: DashboardStats = { users: null, authEnabled: null, images: null, workspaces: null, components: null };

      // Fetch users
      try {
        const res = await fetch(`${API_BASE}/admin/users`, { credentials: "include" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          const items = data.items || [];
          results.users = {
            total: items.length,
            active: items.filter((u: { spec?: { disabled?: boolean } }) => !u.spec?.disabled).length,
            disabled: items.filter((u: { spec?: { disabled?: boolean } }) => u.spec?.disabled).length,
            admins: items.filter((u: { spec?: { role?: string } }) => u.spec?.role === "admin").length,
          };
        }
      } catch { /* ignore */ }

      // Fetch auth config
      try {
        const res = await fetch(`${API_BASE}/admin/auth-config`, { credentials: "include" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          results.authEnabled = data.spec?.enabled ?? false;
        }
      } catch { /* ignore */ }

      // Fetch images
      try {
        const res = await fetch(`${API_BASE}/v1/images`, { credentials: "include" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          results.images = Array.isArray(data) ? data.length : 0;
        }
      } catch { /* ignore */ }

      // Fetch workspaces (all namespaces)
      try {
        const res = await fetch(`${API_BASE}/v1/workspaces?namespace=_all`, { credentials: "include" });
        if (!cancelled && res.ok) {
          const data: Workspace[] = await res.json();
          const wsList = Array.isArray(data) ? data : [];
          results.workspaces = {
            total: wsList.length,
            running: wsList.filter((ws) => getWorkspaceStatus(ws) === "running").length,
            stopped: wsList.filter((ws) => getWorkspaceStatus(ws) === "stopped").length,
            starting: wsList.filter((ws) => getWorkspaceStatus(ws) === "starting").length,
            error: wsList.filter((ws) => getWorkspaceStatus(ws) === "error").length,
          };
        }
      } catch { /* ignore */ }

      // Fetch components (version + operational status)
      try {
        const res = await fetch(`${API_BASE}/platform/version`, { credentials: "include" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          results.components = data.components ?? null;
        }
      } catch { /* ignore */ }

      if (!cancelled) {
        setStats(results);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Admin Overview</h1>
      </div>

      {/* Workspace stats grid */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Workspaces
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            label="Total"
            value={loading ? "-" : String(stats.workspaces?.total ?? 0)}
            href="/workspaces"
            icon={
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75l-5.571-3m11.142 0l4.179 2.25L12 17.25l-9.75-5.25 4.179-2.25" />
              </svg>
            }
          />
          <StatCard
            label="Running"
            value={loading ? "-" : String(stats.workspaces?.running ?? 0)}
            valueColor="text-green-600 dark:text-green-400"
            href="/workspaces"
            icon={
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
              </svg>
            }
          />
          <StatCard
            label="Stopped"
            value={loading ? "-" : String(stats.workspaces?.stopped ?? 0)}
            valueColor="text-gray-500 dark:text-gray-400"
            href="/workspaces"
            icon={
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              </svg>
            }
          />
          <StatCard
            label="Starting"
            value={loading ? "-" : String(stats.workspaces?.starting ?? 0)}
            valueColor="text-yellow-600 dark:text-yellow-400"
            href="/workspaces"
            icon={
              <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            }
          />
          <StatCard
            label="Error"
            value={loading ? "-" : String(stats.workspaces?.error ?? 0)}
            valueColor={stats.workspaces?.error ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}
            href="/workspaces"
            icon={
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Users & system stats grid */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          System
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Users"
            value={loading ? "-" : String(stats.users?.total ?? 0)}
            sub={stats.users ? `${stats.users.active} active` : undefined}
            href="/admin/users"
          />
          <StatCard
            label="Admins"
            value={loading ? "-" : String(stats.users?.admins ?? 0)}
            href="/admin/users"
          />
          <StatCard
            label="Auth"
            value={loading ? "-" : stats.authEnabled ? "Enabled" : "Disabled"}
            valueColor={stats.authEnabled ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}
            href="/admin/settings"
          />
          <StatCard
            label="Images"
            value={loading ? "-" : String(stats.images ?? 0)}
            href="/admin/images"
          />
        </div>
      </div>

      {/* Component status grid */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Component Status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {COMPONENT_LABELS.map(({ key, label }) => (
            <ComponentCard
              key={key}
              label={label}
              data={stats.components?.[key]}
              loading={loading}
            />
          ))}
        </div>
      </div>

      {/* Info box */}
      <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-xs text-gray-500 dark:text-gray-400">
        <p>All configuration is stored as CRDs and can also be managed via <code className="font-mono">kubectl</code>:</p>
        <pre className="mt-1.5 font-mono text-gray-600 dark:text-gray-300 space-y-0.5">
          {`kubectl get workspaces.kubeworkspaces.io --all-namespaces\nkubectl get users.kubeworkspaces.io\nkubectl get authconfigs.kubeworkspaces.io\nkubectl get images.kubeworkspaces.io`}
        </pre>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
  valueColor,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
  valueColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {label}
        </p>
        {icon}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${valueColor || "text-gray-900 dark:text-white"}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</p>
      )}
    </Link>
  );
}

const COMPONENT_LABELS = [
  { key: "api", label: "API" },
  { key: "controller", label: "Controller" },
  { key: "proxy", label: "Proxy" },
  { key: "frontend", label: "Frontend" },
] as const;

function ComponentCard({
  label,
  data,
  loading,
}: {
  label: string;
  data: PlatformComponent | undefined;
  loading: boolean;
}) {
  const variant =
    data?.status === "healthy" ? "success" : data?.status === "starting" ? "warning" : "danger";
  const statusLabel =
    data?.status === "healthy" ? "Healthy" : data?.status === "starting" ? "Starting" : "Down";

  return (
    <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {label}
        </p>
        {data && (
          <Badge variant={variant} dot>
            {statusLabel}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm font-mono text-gray-900 dark:text-white">
        {loading ? "-" : data ? data.version : "unknown"}
      </p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {loading ? "checking…" : data ? `${data.ready}/${data.total} replicas ready` : "not found"}
      </p>
    </div>
  );
}

