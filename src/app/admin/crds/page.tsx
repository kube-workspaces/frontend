"use client";

import { useEffect, useState, useCallback } from "react";
import { stringify as yamlStringify } from "yaml";
import {
  listCRDDefinitions,
  getCRDDefinition,
  listCRDInstances,
  type CRDDefinition,
} from "@/lib/api";

type ViewMode = "crds" | "instances";
type InstanceFormat = "yaml" | "json";

function cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...obj };
  if (cleaned.metadata && typeof cleaned.metadata === "object") {
    const meta = { ...(cleaned.metadata as Record<string, unknown>) };
    delete meta.managedFields;
    delete meta.uid;
    delete meta.resourceVersion;
    delete meta.generation;
    delete meta.creationTimestamp;
    delete meta.ownerReferences;
    delete meta.generateName;
    cleaned.metadata = meta;
  }
  delete cleaned.status;
  return cleaned;
}

export default function CRDBrowserPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("crds");
  const [crds, setCRDs] = useState<CRDDefinition[]>([]);
  const [selectedCRD, setSelectedCRD] = useState<CRDDefinition | null>(null);
  const [instances, setInstances] = useState<Record<string, unknown>[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<Record<string, unknown> | null>(null);
  const [instanceFormat, setInstanceFormat] = useState<InstanceFormat>("yaml");
  const [cleanInstance, setCleanInstance] = useState(true);
  const [loading, setLoading] = useState(true);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCRDs() {
      try {
        const items = await listCRDDefinitions();
        setCRDs(items);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch CRDs");
      } finally {
        setLoading(false);
      }
    }
    fetchCRDs();
  }, []);

  const handleSelectCRD = useCallback(async (crd: CRDDefinition) => {
    setSelectedCRD(crd);
    setSelectedInstance(null);
    // Fetch full definition if we have a name
    const crdName = crd.name || crd.metadata?.name;
    if (crdName) {
      try {
        const full = await getCRDDefinition(crdName);
        setSelectedCRD(full);
      } catch {
        // Use the list version if fetch fails
      }
    }
  }, []);

  const handleViewInstances = useCallback(async () => {
    if (!selectedCRD) return;
    setViewMode("instances");
    setInstancesLoading(true);
    setSelectedInstance(null);
    try {
      const group = selectedCRD.spec?.group || selectedCRD.group || "";
      const plural = selectedCRD.spec?.names?.plural || selectedCRD.plural || "";
      const versions = selectedCRD.spec?.versions || [];
      const version = versions.find((v: { name: string; served: boolean }) => v.served)?.name || versions[0]?.name || "v1";
      const items = await listCRDInstances(group, version, plural);
      setInstances(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch instances");
      setInstances([]);
    } finally {
      setInstancesLoading(false);
    }
  }, [selectedCRD]);

  const handleBackToCRDs = useCallback(() => {
    setViewMode("crds");
    setSelectedInstance(null);
    setInstances([]);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading CRDs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">CRD Browser</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {viewMode === "crds"
              ? "Browse CustomResourceDefinitions in the cluster"
              :               `Instances of ${selectedCRD?.spec?.names?.kind || selectedCRD?.kind || "CRD"}`}
          </p>
        </div>
        {viewMode === "instances" && (
          <button
            onClick={handleBackToCRDs}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            &larr; Back to CRDs
          </button>
        )}
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List panel */}
        <div className="lg:col-span-1">
          <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {viewMode === "crds"
                  ? `CustomResourceDefinitions (${crds.length})`
                  : `Instances (${instances.length})`}
              </span>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800/50 max-h-[600px] overflow-y-auto">
              {viewMode === "crds" ? (
                crds.length === 0 ? (
                  <li className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                    No CRDs found
                  </li>
                ) : (
                  crds.map((crd) => {
                    const crdName = crd.name || crd.metadata?.name || "";
                    const group = crd.spec?.group || crd.group || "";
                    const plural = crd.spec?.names?.plural || crd.plural || "";
                    const scope = crd.spec?.scope || crd.scope || "";
                    const versions = crd.spec?.versions || [];
                    const versionStr = versions[0]?.name || "";
                    return (
                      <li key={crdName}>
                        <button
                          onClick={() => handleSelectCRD(crd)}
                          className={`w-full text-left px-3 py-2.5 transition-colors ${
                            (selectedCRD?.name || selectedCRD?.metadata?.name) === crdName
                              ? "bg-[var(--color-primary-subtle)] border-l-2 border-[var(--color-primary)]"
                              : "hover:bg-gray-50 dark:hover:bg-gray-900"
                          }`}
                        >
                          <div className="text-xs font-medium text-gray-900 dark:text-white font-mono">
                            {plural}
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">
                            {group} &middot; {versionStr} &middot; {scope}
                          </div>
                        </button>
                      </li>
                    );
                  })
                )
              ) : (
                instances.length === 0 && !instancesLoading ? (
                  <li className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                    No instances found
                  </li>
                ) : (
                  instances.map((inst, i) => {
                    const meta = inst.metadata as Record<string, unknown> | undefined;
                    const name = (meta?.name as string) || `instance-${i}`;
                    const namespace = meta?.namespace as string | undefined;
                    const uid = (meta?.uid as string) || `${i}`;
                    return (
                      <li key={uid}>
                        <button
                          onClick={() => setSelectedInstance(inst)}
                          className={`w-full text-left px-3 py-2.5 transition-colors ${
                            selectedInstance === inst
                              ? "bg-[var(--color-primary-subtle)] border-l-2 border-[var(--color-primary)]"
                              : "hover:bg-gray-50 dark:hover:bg-gray-900"
                          }`}
                        >
                          <div className="text-xs font-medium text-gray-900 dark:text-white font-mono">
                            {name}
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">
                            {namespace || "cluster-scoped"} &middot; {uid.slice(0, 8)}
                          </div>
                        </button>
                      </li>
                    );
                  })
                )
              )}
              {instancesLoading && (
                <li className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                  Loading instances...
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {viewMode === "crds"
                  ? selectedCRD
                    ? (selectedCRD.spec?.names?.kind || selectedCRD.kind || "CRD")
                    : "Select a CRD"
                  : selectedInstance
                    ? `${(selectedInstance.metadata as Record<string, unknown>)?.namespace || "cluster"}/${(selectedInstance.metadata as Record<string, unknown>)?.name}`
                    : "Select an instance"}
              </span>
              <div className="flex items-center gap-2">
                {viewMode === "instances" && selectedInstance && (
                  <>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => setInstanceFormat("yaml")}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                          instanceFormat === "yaml"
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        }`}
                      >
                        YAML
                      </button>
                      <button
                        onClick={() => setInstanceFormat("json")}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                          instanceFormat === "json"
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        }`}
                      >
                        JSON
                      </button>
                    </div>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cleanInstance}
                        onChange={(e) => setCleanInstance(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-[var(--color-primary)] focus:ring-[var(--color-primary-muted)] w-3 h-3"
                      />
                      Clean
                    </label>
                  </>
                )}
                {viewMode === "crds" && selectedCRD && (
                  <button
                    onClick={handleViewInstances}
                    className="text-[10px] px-2 py-0.5 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded hover:bg-[var(--color-primary-hover)] transition-colors"
                  >
                    View Instances
                  </button>
                )}
              </div>
            </div>
            <div className="p-3 overflow-auto max-h-[600px]">
              {viewMode === "crds" ? (
                selectedCRD ? (
                  <CRDDetail crd={selectedCRD} />
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Select a CRD from the list to view its definition.
                  </p>
                )
              ) : (
                selectedInstance ? (
                  <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {instanceFormat === "yaml"
                      ? yamlStringify(
                          cleanInstance ? cleanObject(selectedInstance) : selectedInstance,
                          { lineWidth: 120 }
                        )
                      : JSON.stringify(
                          cleanInstance ? cleanObject(selectedInstance) : selectedInstance,
                          null,
                          2
                        )}
                  </pre>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Select an instance from the list to view its full resource object.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CRDDetail({ crd }: { crd: CRDDefinition }) {
  const group = crd.spec?.group || crd.group || "";
  const kind = crd.spec?.names?.kind || crd.kind || "";
  const plural = crd.spec?.names?.plural || crd.plural || "";
  const singular = crd.spec?.names?.singular || "";
  const scope = crd.spec?.scope || crd.scope || "";
  const shortNames = crd.spec?.names?.shortNames || [];
  const versions = crd.spec?.versions || [];
  const conditions = crd.status?.conditions || [];
  const readyCondition = conditions.find((c) => c.type === "Established");

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="grid grid-cols-2 gap-3">
        <InfoRow label="Group" value={group} />
        <InfoRow label="Kind" value={kind} />
        <InfoRow label="Plural" value={plural} />
        {singular && <InfoRow label="Singular" value={singular} />}
        <InfoRow label="Scope" value={scope} />
        {shortNames.length > 0 && (
          <InfoRow label="Short Names" value={shortNames.join(", ")} />
        )}
      </div>

      {/* Status */}
      {readyCondition && (
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${readyCondition.status === "True" ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {readyCondition.type}: {readyCondition.status}
            {readyCondition.message && ` — ${readyCondition.message}`}
          </span>
        </div>
      )}

      {/* Versions */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Versions</h3>
        <div className="space-y-1">
          {versions.map((v: { name: string; served: boolean; storage: boolean }) => (
            <div
              key={v.name}
              className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300"
            >
              <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">
                {v.name}
              </code>
              {v.storage && (
                <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                  storage
                </span>
              )}
              {v.served && (
                <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-primary-subtle)] text-[var(--color-primary)] rounded">
                  served
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Raw JSON */}
      <details>
        <summary className="text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
          Raw CRD Definition
        </summary>
        <pre className="mt-2 text-[10px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-gray-900 rounded p-2 max-h-[300px] overflow-auto">
          {JSON.stringify(crd, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</span>
      <p className="text-xs font-mono text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
