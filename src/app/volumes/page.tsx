"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { listVolumes, listWorkspaces, deleteVolume, Volume } from "@/lib/api";
import { useNamespace } from "@/lib/namespace";
import { useMultiSelect } from "@/lib/use-multi-select";
import { FloatingActionBar, ActionBarAction } from "@/components/floating-action-bar";

interface VolumeWithUsage extends Volume {
  inUse: boolean;
  usedBy: string[];
}

type PhaseFilter = "all" | "Bound" | "Pending" | "Lost";

type SortField = "name" | "size" | "phase" | "storage_class" | "access_mode" | "usedBy";

function parseSizeToBytes(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?$/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = (match[2] || "").toLowerCase();
  const multipliers: Record<string, number> = {
    "": 1, "ki": 1024, "mi": 1024 ** 2, "gi": 1024 ** 3, "ti": 1024 ** 4, "pi": 1024 ** 5, "ei": 1024 ** 6,
    "k": 1000, "m": 1000 ** 2, "g": 1000 ** 3, "t": 1000 ** 4, "p": 1000 ** 5, "e": 1000 ** 6,
  };
  return val * (multipliers[unit] || 1);
}

export default function VolumesPage() {
  const { namespace } = useNamespace();
  const [volumes, setVolumes] = useState<VolumeWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("volumes-phase-filter") as PhaseFilter | null;
      if (saved && ["all", "Bound", "Pending", "Lost"].includes(saved)) return saved;
    }
    return "all";
  });
  const [managedOnly, setManagedOnly] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("volumes-managed-only") === "true";
    }
    return false;
  });
  const [unusedOnly, setUnusedOnly] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("volumes-unused-only") === "true";
    }
    return false;
  });
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchVolumes = useCallback(async () => {
    try {
      const ns = namespace || "_all";
      const [allVolumes, workspaces] = await Promise.all([
        listVolumes(ns),
        listWorkspaces(ns),
      ]);

      const usageMap = new Map<string, string[]>();
      for (const ws of workspaces) {
        for (const vm of ws.volume_mounts || []) {
          const existing = usageMap.get(vm.name) || [];
          existing.push(ws.name);
          usageMap.set(vm.name, existing);
        }
      }

      const enriched: VolumeWithUsage[] = (allVolumes || []).map((v) => ({
        ...v,
        inUse: usageMap.has(v.name),
        usedBy: usageMap.get(v.name) || [],
      }));

      setVolumes(enriched);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch volumes");
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  const fetchVolumesRef = useRef(fetchVolumes);
  useEffect(() => {
    fetchVolumesRef.current = fetchVolumes;
  }, [fetchVolumes]);

  useEffect(() => {
    fetchVolumesRef.current();
    const interval = setInterval(() => fetchVolumesRef.current(), 5000);
    return () => clearInterval(interval);
  }, [fetchVolumes]);

  const handleDelete = async (name: string, volNamespace: string) => {
    if (!confirm(`Are you sure you want to delete volume "${name}"?`)) return;
    try {
      await deleteVolume(name, volNamespace);
      await fetchVolumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete volume");
    }
  };

  const filteredVolumes = volumes.filter((v) => {
    if (phaseFilter !== "all" && v.phase !== phaseFilter) return false;
    if (managedOnly && !(v.labels?.["kubeworkspaces.io/managed"] === "true") && !v.inUse) return false;
    if (unusedOnly && v.inUse) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.namespace.toLowerCase().includes(q) ||
        (v.storage_class || "").toLowerCase().includes(q) ||
        v.usedBy.some((w) => w.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const sortedVolumes = [...filteredVolumes].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "size":
        cmp = parseSizeToBytes(a.size) - parseSizeToBytes(b.size);
        break;
      case "phase":
        cmp = a.phase.localeCompare(b.phase);
        break;
      case "storage_class":
        cmp = (a.storage_class || "").localeCompare(b.storage_class || "");
        break;
      case "access_mode":
        cmp = (a.access_mode || "").localeCompare(b.access_mode || "");
        break;
      case "usedBy":
        cmp = a.usedBy.join(",").localeCompare(b.usedBy.join(","));
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  // Multi-select
  const orderedKeys = useMemo(
    () => sortedVolumes.map((v) => `${v.namespace}/${v.name}`),
    [sortedVolumes]
  );
  const { selected, selectedCount, isSelected, handleSelect, selectAll, clearSelection } =
    useMultiSelect(orderedKeys);

  const selectedVolumes = useMemo(
    () => sortedVolumes.filter((v) => selected.has(`${v.namespace}/${v.name}`)),
    [sortedVolumes, selected]
  );

  const deletableCount = useMemo(
    () => selectedVolumes.filter((v) => !v.inUse).length,
    [selectedVolumes]
  );

  const handleBulkDelete = async () => {
    const toDelete = selectedVolumes.filter((v) => !v.inUse);
    const count = toDelete.length;
    if (count === 0) return;
    if (!confirm(`Are you sure you want to delete ${count} volume${count > 1 ? "s" : ""}?${selectedVolumes.length > count ? ` (${selectedVolumes.length - count} in-use volumes will be skipped)` : ""}`)) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        toDelete.map((v) => deleteVolume(v.name, v.namespace))
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        setError(`Failed to delete ${failures.length} of ${count} volumes`);
      }
      clearSelection();
      await fetchVolumes();
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkActions: ActionBarAction[] = useMemo(() => [
    {
      label: `Delete${deletableCount > 0 ? ` (${deletableCount})` : ""}`,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      ),
      onClick: handleBulkDelete,
      className: "text-red-400 dark:text-red-500 hover:bg-red-900/40 dark:hover:bg-red-100/20",
      disabled: deletableCount === 0 || bulkLoading,
      disabledReason: deletableCount === 0 ? "All selected volumes are in use" : "Processing...",
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [deletableCount, bulkLoading, selectedVolumes]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortArrow = (field: SortField) => {
    if (sortField !== field) return <span className="ml-1 text-gray-300 dark:text-gray-600">{"\u2195"}</span>;
    return <span className="ml-1">{sortAsc ? "\u2191" : "\u2193"}</span>;
  };

  const getPhaseBadge = (phase: string) => {
    switch (phase) {
      case "Bound":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Bound
          </span>
        );
      case "Pending":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {phase || "Unknown"}
          </span>
        );
    }
  };

  const handleRowClick = (vol: VolumeWithUsage, e: React.MouseEvent) => {
    const key = `${vol.namespace}/${vol.name}`;
    if (e.ctrlKey || e.metaKey || e.shiftKey || selectedCount > 0) {
      e.preventDefault();
      handleSelect(key, e);
      return;
    }
    // Normal click — no navigation for volumes (they don't have a detail page that needs it from the row itself)
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading volumes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            Volumes
          </h1>
          <input
            type="text"
            placeholder="Search volumes..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); clearSelection(); }}
            className="w-48 px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-muted)]"
          />
        </div>
        <Link
          href="/volumes/new"
          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          New Volume
        </Link>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {volumes.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
            {(["all", "Bound", "Pending", "Lost"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => { setPhaseFilter(filter); localStorage.setItem("volumes-phase-filter", filter); clearSelection(); }}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  phaseFilter === filter
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {filter === "all" ? "All" : filter}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={managedOnly}
                onChange={(e) => { setManagedOnly(e.target.checked); localStorage.setItem("volumes-managed-only", String(e.target.checked)); clearSelection(); }}
                className="rounded border-gray-300 dark:border-gray-600 text-[var(--color-primary)] focus:ring-[var(--color-primary-muted)]"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">Kube Workspaces only</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={unusedOnly}
                onChange={(e) => { setUnusedOnly(e.target.checked); localStorage.setItem("volumes-unused-only", String(e.target.checked)); clearSelection(); }}
                className="rounded border-gray-300 dark:border-gray-600 text-[var(--color-primary)] focus:ring-[var(--color-primary-muted)]"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">Unused only</span>
            </label>
          </div>
          {selectedCount > 0 && (
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              Ctrl+click or Shift+click to select
            </span>
          )}
        </div>
      )}

      {volumes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No volumes found.
          </p>
        </div>
      ) : filteredVolumes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No volumes match the current filters.
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("name")}>Name{sortArrow("name")}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("size")}>Size{sortArrow("size")}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("phase")}>Status{sortArrow("phase")}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("storage_class")}>Storage Class{sortArrow("storage_class")}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("access_mode")}>Access Mode{sortArrow("access_mode")}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("usedBy")}>Used By{sortArrow("usedBy")}</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-800/50">
              {sortedVolumes.map((vol) => {
                const key = `${vol.namespace}/${vol.name}`;
                const sel = isSelected(key);
                return (
                  <tr
                    key={key}
                    onClick={(e) => handleRowClick(vol, e)}
                    className={`transition-colors cursor-pointer select-none ${
                      sel
                        ? "bg-[var(--color-primary-subtle)] border-l-2 border-l-[var(--color-primary)]"
                        : "hover:bg-gray-50 dark:hover:bg-gray-900 border-l-2 border-l-transparent"
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`/volumes/${vol.name}`} className="text-sm font-medium text-gray-900 dark:text-white hover:text-[var(--color-primary)] transition-colors" onClick={(e) => { if (selectedCount > 0) e.preventDefault(); }}>
                        {vol.name}
                      </Link>
                      <div className="text-xs text-gray-400 dark:text-gray-500">{vol.namespace}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300">{vol.size}</td>
                    <td className="px-4 py-2.5">{getPhaseBadge(vol.phase)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{vol.storage_class || "-"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{vol.access_mode || "-"}</td>
                    <td className="px-4 py-2.5">
                      {vol.inUse ? (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {vol.usedBy.join(", ")}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">unused</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(vol.name, vol.namespace); }}
                        className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium"
                      >
                        Delete
                      </button>
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
        totalCount={sortedVolumes.length}
      />
    </div>
  );
}
