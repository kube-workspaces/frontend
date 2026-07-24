"use client";

import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  listWorkspaces,
  listImages,
  startWorkspace,
  stopWorkspace,
  deleteWorkspace,
  Workspace,
  WorkspaceImage,
  getProxyUrl,
} from "@/lib/api";
import { useNamespace } from "@/lib/namespace";
import { useMultiSelect } from "@/lib/use-multi-select";
import { FloatingActionBar, ActionBarAction } from "@/components/floating-action-bar";
import dynamic from "next/dynamic";

const TerminalModal = dynamic(() => import("@/components/terminal-modal"), {
  ssr: false,
});

export default function WorkspacesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      }
    >
      <WorkspacesContent />
    </Suspense>
  );
}

function WorkspacesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { namespace } = useNamespace();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped" | "starting">(() => {
    if (searchParams.get("running") === "true") return "running";
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("workspaces-status-filter") as "all" | "running" | "stopped" | "starting" | null;
      if (saved && ["all", "running", "stopped", "starting"].includes(saved)) return saved;
    }
    return "all";
  });
  const [terminalTarget, setTerminalTarget] = useState<{ name: string; namespace: string } | null>(null);
  const [sortField, setSortField] = useState<"name" | "image" | "status" | "created">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "tiles">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("workspaces-view") as "table" | "tiles") || "table";
    }
    return "table";
  });
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const ns = namespace || "_all";
      const [wsData, imgData] = await Promise.all([
        listWorkspaces(ns),
        listImages(),
      ]);
      setWorkspaces(wsData || []);
      setImages(imgData || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch workspaces");
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  const fetchWorkspacesRef = useRef(fetchWorkspaces);
  useEffect(() => {
    fetchWorkspacesRef.current = fetchWorkspaces;
  }, [fetchWorkspaces]);

  useEffect(() => {
    fetchWorkspacesRef.current();
    // Pause auto-refresh while the terminal modal is open
    if (terminalTarget) return;
    const interval = setInterval(() => fetchWorkspacesRef.current(), 5000);
    return () => clearInterval(interval);
  }, [fetchWorkspaces, terminalTarget]);

  const handleStart = async (name: string, ns: string) => {
    try {
      await startWorkspace(name, ns);
      await fetchWorkspaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start workspace");
    }
  };

  const handleStop = async (name: string, ns: string) => {
    try {
      await stopWorkspace(name, ns);
      await fetchWorkspaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop workspace");
    }
  };

  const handleDelete = async (name: string, ns: string) => {
    if (!confirm(`Are you sure you want to delete workspace "${name}"?`)) return;
    try {
      await deleteWorkspace(name, ns);
      await fetchWorkspaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workspace");
    }
  };

  const getStatus = (ws: Workspace): "running" | "stopped" | "starting" | "error" => {
    if (ws.stopped) return "stopped";
    if (ws.ready_replicas > 0) return "running";
    const cs = ws.container_state;
    if (cs?.state === "waiting" && cs?.reason && ["Pending", "Unschedulable", "CreateContainerConfigError", "ImagePullBackOff", "CrashLoopBackOff"].includes(cs.reason)) {
      return "error";
    }
    return "starting";
  };

  const filteredWorkspaces = workspaces.filter((ws) => {
    if (statusFilter !== "all") {
      const status = getStatus(ws);
      if (status !== statusFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        ws.name.toLowerCase().includes(q) ||
        ws.namespace.toLowerCase().includes(q) ||
        ws.image.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleSort = (field: "name" | "image" | "status" | "created") => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const statusOrder: Record<string, number> = { running: 0, starting: 1, error: 2, stopped: 3 };

  const sortedWorkspaces = [...filteredWorkspaces].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "image":
        cmp = a.image.localeCompare(b.image);
        break;
      case "status":
        cmp = (statusOrder[getStatus(a)] ?? 9) - (statusOrder[getStatus(b)] ?? 9);
        break;
      case "created":
        cmp = (a.created_at || "").localeCompare(b.created_at || "");
        break;
    }
    return sortDirection === "asc" ? cmp : -cmp;
  });

  // Multi-select: keys are "namespace/name"
  const orderedKeys = useMemo(
    () => sortedWorkspaces.map((ws) => `${ws.namespace}/${ws.name}`),
    [sortedWorkspaces]
  );
  const { selected, selectedCount, isSelected, handleSelect, selectAll, clearSelection } =
    useMultiSelect(orderedKeys);

  // Derive smart actions based on what's selected
  const selectedWorkspaces = useMemo(
    () => sortedWorkspaces.filter((ws) => selected.has(`${ws.namespace}/${ws.name}`)),
    [sortedWorkspaces, selected]
  );

  const canStart = useMemo(
    () => selectedWorkspaces.some((ws) => ws.stopped),
    [selectedWorkspaces]
  );
  const canStop = useMemo(
    () => selectedWorkspaces.some((ws) => !ws.stopped && ws.ready_replicas > 0),
    [selectedWorkspaces]
  );
  const stoppableCount = useMemo(
    () => selectedWorkspaces.filter((ws) => !ws.stopped).length,
    [selectedWorkspaces]
  );
  const startableCount = useMemo(
    () => selectedWorkspaces.filter((ws) => ws.stopped).length,
    [selectedWorkspaces]
  );

  const handleBulkStart = async () => {
    const toStart = selectedWorkspaces.filter((ws) => ws.stopped);
    if (toStart.length === 0) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        toStart.map((ws) => startWorkspace(ws.name, ws.namespace))
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        setError(`Failed to start ${failures.length} of ${toStart.length} workspaces`);
      }
      clearSelection();
      await fetchWorkspaces();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStop = async () => {
    const toStop = selectedWorkspaces.filter((ws) => !ws.stopped);
    if (toStop.length === 0) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        toStop.map((ws) => stopWorkspace(ws.name, ws.namespace))
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        setError(`Failed to stop ${failures.length} of ${toStop.length} workspaces`);
      }
      clearSelection();
      await fetchWorkspaces();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedWorkspaces.length;
    if (!confirm(`Are you sure you want to delete ${count} workspace${count > 1 ? "s" : ""}?`)) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        selectedWorkspaces.map((ws) => deleteWorkspace(ws.name, ws.namespace))
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        setError(`Failed to delete ${failures.length} of ${count} workspaces`);
      }
      clearSelection();
      await fetchWorkspaces();
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkActions: ActionBarAction[] = useMemo(() => [
    {
      label: `Start${startableCount > 0 ? ` (${startableCount})` : ""}`,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
      ),
      onClick: handleBulkStart,
      className: "text-green-400 dark:text-green-500 hover:bg-green-900/40 dark:hover:bg-green-100/20",
      disabled: !canStart || bulkLoading,
      disabledReason: !canStart ? "No stopped workspaces selected" : "Processing...",
    },
    {
      label: `Stop${stoppableCount > 0 ? ` (${stoppableCount})` : ""}`,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
        </svg>
      ),
      onClick: handleBulkStop,
      className: "text-amber-400 dark:text-amber-500 hover:bg-amber-900/40 dark:hover:bg-amber-100/20",
      disabled: !canStop || bulkLoading,
      disabledReason: !canStop ? "No running workspaces selected" : "Processing...",
    },
    {
      label: `Delete (${selectedCount})`,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      ),
      onClick: handleBulkDelete,
      className: "text-red-400 dark:text-red-500 hover:bg-red-900/40 dark:hover:bg-red-100/20",
      disabled: bulkLoading,
      disabledReason: "Processing...",
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canStart, canStop, startableCount, stoppableCount, selectedCount, bulkLoading, selectedWorkspaces]);

  const getConnectUrl = (ws: Workspace) => {
    const img = images.find((i) => i.image === ws.image);
    const path = img?.default_path || "/";
    return getProxyUrl(ws.namespace, ws.name, path);
  };

  const getStatusBadge = (ws: Workspace) => {
    if (ws.stopped) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          Stopped
        </span>
      );
    }
    if (ws.ready_replicas > 0) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Running
        </span>
      );
    }
    const cs = ws.container_state;
    if (cs?.state === "waiting" && cs?.reason && ["Pending", "Unschedulable", "CreateContainerConfigError", "ImagePullBackOff", "CrashLoopBackOff"].includes(cs.reason)) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {cs.reason}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        Starting
      </span>
    );
  };

  const handleRowClick = (ws: Workspace, e: React.MouseEvent) => {
    const key = `${ws.namespace}/${ws.name}`;
    // If ctrl/shift/meta held or there's an active selection, handle multi-select
    if (e.ctrlKey || e.metaKey || e.shiftKey || selectedCount > 0) {
      e.preventDefault();
      handleSelect(key, e);
      return;
    }
    // Normal click navigates
    router.push(`/workspaces/${ws.name}?namespace=${ws.namespace}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading workspaces...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            Workspaces
          </h1>
          <input
            type="text"
            placeholder="Search workspaces..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); clearSelection(); }}
            className="w-48 px-2.5 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-muted)] focus:border-[var(--color-primary)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-gray-700 p-0.5">
            <button
              onClick={() => { setViewMode("table"); localStorage.setItem("workspaces-view", "table"); }}
              className={`px-2 py-1 text-xs rounded ${
                viewMode === "table"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              title="Table view"
            >
              {"\u2261"}
            </button>
            <button
              onClick={() => { setViewMode("tiles"); localStorage.setItem("workspaces-view", "tiles"); }}
              className={`px-2 py-1 text-xs rounded ${
                viewMode === "tiles"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              title="Tile view"
            >
              {"\u25A6"}
            </button>
          </div>
          <Link
            href="/workspaces/new"
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] shadow-sm shadow-[var(--shadow-primary)] transition-all hover:-translate-y-[0.5px]"
          >
            New Workspace
          </Link>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {workspaces.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
          {(["all", "running", "stopped", "starting"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setStatusFilter(filter);
                localStorage.setItem("workspaces-status-filter", filter);
                clearSelection();
                if (filter === "running") {
                  router.replace("/workspaces?running=true");
                } else {
                  router.replace("/workspaces");
                }
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === filter
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "bg-[var(--color-surface-inset)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
          {selectedCount > 0 && (
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              Ctrl+click or Shift+click to select
            </span>
          )}
        </div>
      )}

      {workspaces.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No workspaces found. Create one to get started.
          </p>
        </div>
      ) : filteredWorkspaces.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No workspaces match the current filter.
          </p>
        </div>
      ) : viewMode === "tiles" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedWorkspaces.map((ws) => (
            <WorkspaceTileCard
              key={`${ws.namespace}/${ws.name}`}
              ws={ws}
              images={images}
              getStatus={getStatus}
              getConnectUrl={getConnectUrl}
              onStart={handleStart}
              onStop={handleStop}
              onDelete={handleDelete}
              onConsole={(name, namespace) => setTerminalTarget({ name, namespace })}
            />
          ))}
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th
                  className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                  onClick={() => toggleSort("name")}
                >
                  <span className="inline-flex items-center gap-1">
                    Name
                    <SortIndicator field="name" current={sortField} direction={sortDirection} />
                  </span>
                </th>
                <th
                  className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                  onClick={() => toggleSort("image")}
                >
                  <span className="inline-flex items-center gap-1">
                    Image
                    <SortIndicator field="image" current={sortField} direction={sortDirection} />
                  </span>
                </th>
                <th
                  className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                  onClick={() => toggleSort("status")}
                >
                  <span className="inline-flex items-center gap-1">
                    Status
                    <SortIndicator field="status" current={sortField} direction={sortDirection} />
                  </span>
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resources
                </th>
                <th
                  className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                  onClick={() => toggleSort("created")}
                >
                  <span className="inline-flex items-center gap-1">
                    Created
                    <SortIndicator field="created" current={sortField} direction={sortDirection} />
                  </span>
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-800/50">
              {sortedWorkspaces.map((ws) => {
                const key = `${ws.namespace}/${ws.name}`;
                const sel = isSelected(key);
                return (
                  <tr
                    key={key}
                    onClick={(e) => handleRowClick(ws, e)}
                    className={`transition-colors cursor-pointer select-none ${
                      sel
                        ? "bg-[var(--color-primary-subtle)] border-l-2 border-l-[var(--color-primary)]"
                        : "hover:bg-[var(--color-surface-hover)] border-l-2 border-l-transparent"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/workspaces/${ws.name}?namespace=${ws.namespace}`} className="block" onClick={(e) => { if (selectedCount > 0) e.preventDefault(); }}>
                        <span className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
                          {ws.name}
                        </span>
                        <span className="block text-xs text-gray-400 dark:text-gray-500">
                          {ws.namespace}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                        {ws.image.length > 35 ? `...${ws.image.slice(-32)}` : ws.image}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(ws)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {ws.cpu_request} / {ws.memory_request}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {ws.created_at
                        ? new Date(ws.created_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {ws.ready_replicas > 0 && !ws.stopped && (
                          <a
                            href={getConnectUrl(ws)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Connect"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded hover:bg-[var(--color-primary-subtle)] text-[var(--color-primary)] transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        )}
                        {ws.ready_replicas > 0 && !ws.stopped && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setTerminalTarget({ name: ws.name, namespace: ws.namespace }); }}
                            title="Console"
                            className="p-1.5 rounded hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                          </button>
                        )}
                        {ws.stopped ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStart(ws.name, ws.namespace); }}
                            title="Start"
                            className="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                            </svg>
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStop(ws.name, ws.namespace); }}
                            title="Stop"
                            className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(ws.name, ws.namespace); }}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <FloatingActionBar
        selectedCount={selectedCount}
        actions={bulkActions}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        totalCount={sortedWorkspaces.length}
      />

      {terminalTarget && (
        <TerminalModal
          workspaceName={terminalTarget.name}
          namespace={terminalTarget.namespace}
          onClose={() => setTerminalTarget(null)}
        />
      )}
    </div>
  );
}

function SortIndicator({
  field,
  current,
  direction,
}: {
  field: string;
  current: string;
  direction: "asc" | "desc";
}) {
  if (field !== current) {
    return (
      <svg className="w-3 h-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  if (direction === "asc") {
    return (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function WorkspaceTileCard({
  ws,
  images,
  getStatus,
  getConnectUrl,
  onStart,
  onStop,
  onDelete,
  onConsole,
}: {
  ws: Workspace;
  images: WorkspaceImage[];
  getStatus: (ws: Workspace) => "running" | "stopped" | "starting" | "error";
  getConnectUrl: (ws: Workspace) => string;
  onStart: (name: string, ns: string) => void;
  onStop: (name: string, ns: string) => void;
  onDelete: (name: string, ns: string) => void;
  onConsole: (name: string, ns: string) => void;
}) {
  const router = useRouter();
  const status = getStatus(ws);
  const img = images.find((i) => i.image === ws.image);
  const icon = img?.icon;

  const statusColor = {
    running: "border-green-500 dark:border-green-400",
    stopped: "border-gray-300 dark:border-gray-600",
    starting: "border-amber-400 dark:border-amber-500",
    error: "border-red-400 dark:border-red-500",
  }[status];

  const statusDot = {
    running: "bg-green-500",
    stopped: "bg-gray-400",
    starting: "bg-amber-400 animate-pulse",
    error: "bg-red-500",
  }[status];

  const monitorBg = {
    running: "bg-gray-900 dark:bg-gray-800",
    stopped: "bg-gray-200 dark:bg-gray-800",
    starting: "bg-gray-800 dark:bg-gray-800",
    error: "bg-gray-200 dark:bg-gray-800",
  }[status];

  return (
    <div
      onClick={() => router.push(`/workspaces/${ws.name}?namespace=${ws.namespace}`)}
      className={`relative border-2 ${statusColor} rounded-lg p-4 hover:shadow-md transition-all cursor-pointer bg-white dark:bg-gray-950 flex flex-col items-center`}
    >
      {/* Status dot */}
      <div className={`absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full ${statusDot}`} />

      {/* Monitor graphic */}
      <div className="w-full flex justify-center mb-3">
        <div className="relative">
          {/* Monitor bezel */}
          <div className={`w-32 h-24 rounded-md ${monitorBg} border-2 border-gray-700 dark:border-gray-600 flex items-center justify-center overflow-hidden`}>
            {/* Screen content - icon */}
            {icon ? (
              icon.startsWith("http://") || icon.startsWith("https://") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" className="w-12 h-12 object-contain opacity-80" />
              ) : icon.trimStart().startsWith("<svg") ? (
                <span
                  className="w-12 h-12 flex items-center justify-center text-gray-400 dark:text-gray-500"
                  dangerouslySetInnerHTML={{ __html: icon }}
                />
              ) : (
                <span className="text-2xl">{icon}</span>
              )
            ) : (
              <svg className="w-10 h-10 text-gray-500 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
              </svg>
            )}
          </div>
          {/* Monitor stand */}
          <div className="mx-auto w-8 h-2 bg-gray-600 dark:bg-gray-500 rounded-b-sm" />
          <div className="mx-auto w-14 h-1.5 bg-gray-500 dark:bg-gray-600 rounded-b-md" />
        </div>
      </div>

      {/* Workspace name */}
      <h3 className="text-sm font-medium text-gray-900 dark:text-white text-center truncate w-full">
        {ws.name}
      </h3>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center truncate w-full">
        {ws.namespace}
      </p>

      {/* Action buttons */}
      <div className="mt-3 flex items-center gap-1.5">
        {status === "running" && (
          <a
            href={getConnectUrl(ws)}
            target="_blank"
            rel="noopener noreferrer"
            title="Connect"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle-hover)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        )}
        {status === "running" && (
          <button
            onClick={(e) => { e.stopPropagation(); onConsole(ws.name, ws.namespace); }}
            title="Console"
            className="p-1.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </button>
        )}
        {ws.stopped ? (
          <button
            onClick={(e) => { e.stopPropagation(); onStart(ws.name, ws.namespace); }}
            title="Start"
            className="p-1.5 rounded bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onStop(ws.name, ws.namespace); }}
            title="Stop"
            className="p-1.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
            </svg>
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(ws.name, ws.namespace); }}
          title="Delete"
          className="p-1.5 rounded bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}
