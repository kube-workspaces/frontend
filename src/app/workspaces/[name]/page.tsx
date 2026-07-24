"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { stringify as yamlStringify } from "yaml";
import {
  getWorkspace,
  getWorkspaceLogs,
  getWorkspaceEvents,
  getWorkspacePod,
  getWorkspaceCR,
  startWorkspace,
  stopWorkspace,
  deleteWorkspace,
  updateWorkspace,
  listImages,
  listVolumes,
  getWorkspaceMetrics,
  Workspace,
  WorkspaceEvent,
  WorkspaceImage,
  Volume,
  PodInfo,
  ContainerState,
  ContainerStatus,
  PodMetricsResponse,
  PodMetricPoint,
  getProxyUrl,
} from "@/lib/api";

const TerminalModal = dynamic(() => import("@/components/terminal-modal"), {
  ssr: false,
});

type Tab = "overview" | "pod" | "metrics" | "logs" | "events" | "yaml";

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = params.name as string;
  const namespace = searchParams.get("namespace") || "workspaces";

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [logs, setLogs] = useState<string>("");
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [podData, setPodData] = useState<PodInfo | null>(null);
  const [crData, setCrData] = useState<object | null>(null);
  const [yamlView, setYamlView] = useState<"workspace" | "pod">("workspace");
  const [cleanYaml, setCleanYaml] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editVolumes, setEditVolumes] = useState<Volume[]>([]);
  const [editForm, setEditForm] = useState({
    image: "",
    port: 8080,
    cpu_request: "500m",
    memory_request: "512Mi",
    cpu_limit: "2",
    memory_limit: "2Gi",
    volume_mounts: [] as { name: string; mountPath: string }[],
  });

  const [metricsData, setMetricsData] = useState<PodMetricsResponse | null>(null);
  const [metricsWindow, setMetricsWindow] = useState("1h");
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const fetchWorkspace = useCallback(async () => {
    try {
      const [ws, imgs] = await Promise.all([
        getWorkspace(name, namespace),
        listImages(),
      ]);
      setWorkspace(ws);
      setImages(imgs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch workspace");
    } finally {
      setLoading(false);
    }
  }, [name, namespace]);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await getWorkspaceLogs(name, namespace);
      setLogs(data);
    } catch (err) {
      setLogs(err instanceof Error ? err.message : "Failed to fetch logs");
    }
  }, [name, namespace]);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await getWorkspaceEvents(name, namespace);
      setEvents(data);
    } catch {
      setEvents([]);
    }
  }, [name, namespace]);

  const fetchYaml = useCallback(async () => {
    try {
      const [pod, cr] = await Promise.all([
        getWorkspacePod(name, namespace).catch(() => null),
        getWorkspaceCR(name, namespace),
      ]);
      setCrData(cr);
      setPodData(pod);
    } catch {
      setCrData(null);
      setPodData(null);
    }
  }, [name, namespace]);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await getWorkspaceMetrics(name, namespace, metricsWindow);
      setMetricsData(data);
      setMetricsError(null);
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Failed to fetch metrics");
    }
  }, [name, namespace, metricsWindow]);

  const fetchWorkspaceRef = useRef(fetchWorkspace);
  const fetchLogsRef = useRef(fetchLogs);
  const fetchEventsRef = useRef(fetchEvents);
  const fetchYamlRef = useRef(fetchYaml);
  const fetchMetricsRef = useRef(fetchMetrics);

  useEffect(() => {
    fetchWorkspaceRef.current = fetchWorkspace;
    fetchLogsRef.current = fetchLogs;
    fetchEventsRef.current = fetchEvents;
    fetchYamlRef.current = fetchYaml;
    fetchMetricsRef.current = fetchMetrics;
  }, [fetchWorkspace, fetchLogs, fetchEvents, fetchYaml, fetchMetrics]);

  useEffect(() => {
    if (terminalOpen) return;
    fetchWorkspaceRef.current();
    const interval = setInterval(() => fetchWorkspaceRef.current(), 5000);
    return () => clearInterval(interval);
  }, [fetchWorkspace, terminalOpen]);

  useEffect(() => {
    if (activeTab === "logs") fetchLogsRef.current();
    if (activeTab === "events") fetchEventsRef.current();
    if (activeTab === "yaml" || activeTab === "pod" || activeTab === "overview") fetchYamlRef.current();
    if (activeTab === "metrics") fetchMetricsRef.current();
  }, [activeTab, fetchLogs, fetchEvents, fetchYaml, fetchMetrics]);

  useEffect(() => {
    if (terminalOpen) return;
    if (activeTab === "logs") {
      const interval = setInterval(() => fetchLogsRef.current(), 5000);
      return () => clearInterval(interval);
    }
    if (activeTab === "events") {
      const interval = setInterval(() => fetchEventsRef.current(), 10000);
      return () => clearInterval(interval);
    }
    if (activeTab === "metrics") {
      const interval = setInterval(() => fetchMetricsRef.current(), 15000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchLogs, fetchEvents, fetchMetrics, terminalOpen]);

  useEffect(() => {
    if (activeTab === "metrics") {
      fetchMetricsRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsWindow]);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await startWorkspace(name, namespace);
      await fetchWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start workspace");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await stopWorkspace(name, namespace);
      await fetchWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop workspace");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete workspace "${name}"? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await deleteWorkspace(name, namespace);
      router.push("/workspaces");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workspace");
      setActionLoading(false);
    }
  };

  const openEdit = async () => {
    if (!workspace) return;
    try {
      const volumesData = await listVolumes();
      setEditVolumes(volumesData || []);
    } catch {
      setEditVolumes([]);
    }
    setEditForm({
      image: workspace.image,
      port: workspace.port || 8080,
      cpu_request: workspace.cpu_request || "500m",
      memory_request: workspace.memory_request || "512Mi",
      cpu_limit: workspace.cpu_limit || "2",
      memory_limit: workspace.memory_limit || "2Gi",
      volume_mounts: (workspace.volume_mounts || []).map((vm) => ({
        name: vm.name,
        mountPath: vm.mount_path,
      })),
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    setActionLoading(true);
    try {
      await updateWorkspace(name, {
        image: editForm.image,
        port: editForm.port,
        cpu_request: editForm.cpu_request,
        memory_request: editForm.memory_request,
        cpu_limit: editForm.cpu_limit,
        memory_limit: editForm.memory_limit,
        volume_mounts: editForm.volume_mounts.map((vm) => ({
          name: vm.name,
          mount_path: vm.mountPath,
        })),
      }, namespace);
      setEditOpen(false);
      await fetchWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workspace");
    } finally {
      setActionLoading(false);
    }
  };

  const getConnectUrl = () => {
    if (!workspace) return "#";
    const img = images.find((i) => i.image === workspace.image);
    const path = img?.default_path || "/";
    return getProxyUrl(workspace.namespace, workspace.name, path);
  };

  const isImagePulling = (cs: ContainerState | undefined) =>
    cs?.state === "waiting" && cs?.reason != null && ["ImagePullBackOff", "ErrImagePull", "ContainerCreating"].includes(cs.reason);

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
    if (isImagePulling(ws.container_state)) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          Starting &middot; image pulling
        </span>
      );
    }
    const cs = ws.container_state;
    if (cs?.state === "waiting" && cs?.reason && ["Pending", "Unschedulable", "CreateContainerConfigError", "CrashLoopBackOff"].includes(cs.reason)) {
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading workspace...</div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">Workspace not found.</p>
        <Link href="/workspaces" className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] mt-2 inline-block">
          Back to workspaces
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "pod", label: "Pod" },
    { id: "metrics", label: "Metrics" },
    { id: "logs", label: "Logs" },
    { id: "events", label: "Events" },
    { id: "yaml", label: "YAML" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{workspace.name}</h1>
              {getStatusBadge(workspace)}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">{workspace.namespace}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {workspace.ready_replicas > 0 && !workspace.stopped && (
            <a
              href={getConnectUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-gray-600 dark:text-gray-300 hover:text-[var(--color-primary)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Connect
            </a>
          )}
          {workspace.ready_replicas > 0 && !workspace.stopped && (
            <button
              onClick={() => setTerminalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
              Console
            </button>
          )}
          <button
            onClick={openEdit}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Edit
          </button>
          {workspace.stopped ? (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Start
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              </svg>
              Stop
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-md">
        {activeTab === "overview" && <OverviewTab workspace={workspace} images={images} crData={crData} />}
        {activeTab === "pod" && <PodTab podData={podData} />}
        {activeTab === "metrics" && <MetricsTab data={metricsData} window={metricsWindow} onWindowChange={setMetricsWindow} error={metricsError} />}
        {activeTab === "logs" && <LogsTab logs={logs} onRefresh={fetchLogs} />}
        {activeTab === "events" && <EventsTab events={events} onRefresh={fetchEvents} />}
        {activeTab === "yaml" && (
          <YamlTab
            crData={crData}
            podData={podData}
            yamlView={yamlView}
            setYamlView={setYamlView}
            cleanYaml={cleanYaml}
            setCleanYaml={setCleanYaml}
            onRefresh={fetchYaml}
          />
        )}
      </div>

      <EditModal
        open={editOpen}
        form={editForm}
        setForm={setEditForm}
        volumes={editVolumes}
        onSave={handleUpdate}
        onCancel={() => setEditOpen(false)}
        saving={actionLoading}
      />

      {terminalOpen && workspace && (
        <TerminalModal
          workspaceName={workspace.name}
          namespace={workspace.namespace}
          onClose={() => setTerminalOpen(false)}
        />
      )}
    </div>
  );
}

function OverviewTab({ workspace, images, crData }: { workspace: Workspace; images: WorkspaceImage[]; crData: object | null }) {
  const img = images.find((i) => i.image === workspace.image);
  const cs = workspace.container_state;
  const hasProblem = cs?.state === "waiting" && cs?.reason && ["Pending", "Unschedulable", "CreateContainerConfigError", "ImagePullBackOff", "ErrImagePull", "CrashLoopBackOff"].includes(cs.reason);
  const pullingImage = cs?.state === "waiting" && cs?.reason != null && ["ImagePullBackOff", "ErrImagePull", "ContainerCreating"].includes(cs.reason);

  // Extract action annotations from CR data
  const annotations = (crData as { metadata?: { annotations?: Record<string, string> } })?.metadata?.annotations;
  const createdBy = annotations?.["kubeworkspaces.io/created-by"];
  const lastAction = annotations?.["kubeworkspaces.io/last-action"];
  const lastActionBy = annotations?.["kubeworkspaces.io/last-action-by"];
  const lastActionTime = annotations?.["kubeworkspaces.io/last-action-time"];

  return (
    <div className="p-4">
      {hasProblem && (
        <div className="mb-4 border border-amber-200 dark:border-amber-800 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{cs!.reason}</p>
              {cs!.message && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{cs!.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-white">{workspace.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Namespace</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-white">{workspace.namespace}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Image</dt>
          <dd className="mt-0.5 font-mono text-xs">
            <Link href={`/images/${img?.cr_name ?? workspace.image}`} className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">{workspace.image}</Link>
          </dd>
          {img?.description && (
            <dd className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{img.description}</dd>
          )}
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Port</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-white">{workspace.port || "-"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-white">
            {workspace.stopped ? "Stopped" : workspace.ready_replicas > 0 ? "Running" : pullingImage ? "Starting (image pulling)" : "Starting"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">CPU (request / limit)</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-white">
            {workspace.cpu_request || "-"} / {workspace.cpu_limit || "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Memory (request / limit)</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-white">
            {workspace.memory_request || "-"} / {workspace.memory_limit || "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Created</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-white">
            {workspace.created_at ? new Date(workspace.created_at).toLocaleString() : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Ready Replicas</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-white">{workspace.ready_replicas}</dd>
        </div>

        {workspace.container_state && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Container State</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white text-xs">
              {workspace.container_state.state || "-"}
              {workspace.container_state.reason && (
                <span className="ml-1.5 text-gray-400">({workspace.container_state.reason})</span>
              )}
              {workspace.container_state.started_at && (
                <span className="ml-1.5 text-gray-400">
                  since {new Date(workspace.container_state.started_at).toLocaleString()}
                </span>
              )}
              {workspace.container_state.message && (
                <div className="mt-1 text-gray-500 dark:text-gray-400">{workspace.container_state.message}</div>
              )}
            </dd>
          </div>
        )}

        {workspace.volume_mounts && workspace.volume_mounts.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Volumes</dt>
            <dd>
              <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                {workspace.volume_mounts.map((vm) => (
                  <div key={vm.name} className="px-3 py-1.5 flex justify-between text-xs border-b border-gray-100 dark:border-gray-800/50 last:border-0">
                    <Link href={`/volumes/${vm.name}`} className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">{vm.name}</Link>
                    <span className="text-gray-500 dark:text-gray-400 font-mono">{vm.mount_path}</span>
                  </div>
                ))}
              </div>
            </dd>
          </div>
        )}

        {workspace.conditions && workspace.conditions.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Conditions</dt>
            <dd>
              <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="px-3 py-1.5 font-medium">Type</th>
                      <th className="px-3 py-1.5 font-medium">Status</th>
                      <th className="px-3 py-1.5 font-medium">Reason</th>
                      <th className="px-3 py-1.5 font-medium">Last Transition</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-900 dark:text-white divide-y divide-gray-100 dark:divide-gray-800/50">
                    {workspace.conditions.map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{c.type}</td>
                        <td className="px-3 py-1.5">{c.status}</td>
                        <td className="px-3 py-1.5">{c.reason || "-"}</td>
                        <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">
                          {c.last_transition_time ? new Date(c.last_transition_time).toLocaleString() : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </dd>
          </div>
        )}

        {img?.default_credentials && (img.default_credentials.username || img.default_credentials.password) && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Default Credentials</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-xs font-mono text-gray-700 dark:text-gray-300">
              {img.default_credentials.username && <span>{img.default_credentials.username}</span>}
              {img.default_credentials.password && (
                <span className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {img.default_credentials.password}
                </span>
              )}
            </dd>
          </div>
        )}

        {(createdBy || lastAction) && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Activity</dt>
            <dd className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
              {createdBy && (
                <div>Created by <span className="font-medium">{createdBy}</span></div>
              )}
              {lastAction && (
                <div>
                  Last action: <span className="font-medium">{lastAction}</span>
                  {lastActionBy && <> by <span className="font-medium">{lastActionBy}</span></>}
                  {lastActionTime && (
                    <span className="ml-1 text-gray-400 dark:text-gray-500">
                      ({new Date(lastActionTime).toLocaleString()})
                    </span>
                  )}
                </div>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function LogsTab({ logs, onRefresh }: { logs: string; onRefresh: () => void }) {
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Container Logs (last 500 lines)
        </span>
        <button
          onClick={onRefresh}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>
      <pre className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-3 rounded-md overflow-x-auto text-xs font-mono max-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed border border-gray-200 dark:border-gray-800">
        {logs || "No logs available."}
      </pre>
    </div>
  );
}

function EventsTab({ events, onRefresh }: { events: WorkspaceEvent[]; onRefresh: () => void }) {
  const [sortField, setSortField] = useState<keyof WorkspaceEvent | null>("last_seen");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...events].sort((a, b) => {
    if (!sortField) return 0;
    let va: string | number | undefined = a[sortField];
    let vb: string | number | undefined = b[sortField];
    if (sortField === "count") {
      va = va ?? 0;
      vb = vb ?? 0;
    }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  const handleSort = (field: keyof WorkspaceEvent) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "last_seen");
    }
  };

  const sortArrow = (field: keyof WorkspaceEvent) => {
    if (sortField !== field) return <span className="ml-1 text-gray-300 dark:text-gray-600">{"\u2195"}</span>;
    return <span className="ml-1">{sortAsc ? "\u2191" : "\u2193"}</span>;
  };
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Events ({events.length})
        </span>
        <button
          onClick={onRefresh}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">No events found.</p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-xs">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="px-3 py-1.5 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("type")}>
                  Type{sortArrow("type")}
                </th>
                <th className="px-3 py-1.5 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("reason")}>
                  Reason{sortArrow("reason")}
                </th>
                <th className="px-3 py-1.5 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("object")}>
                  Object{sortArrow("object")}
                </th>
                <th className="px-3 py-1.5 font-medium">Message</th>
                <th className="px-3 py-1.5 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("count")}>
                  Count{sortArrow("count")}
                </th>
                <th className="px-3 py-1.5 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" onClick={() => handleSort("last_seen")}>
                  Last Seen{sortArrow("last_seen")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
              {sorted.map((event, i) => (
                <tr key={i} className="text-gray-900 dark:text-white">
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        event.type === "Warning"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                      }`}
                    >
                      {event.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-medium">{event.reason}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{event.object}</td>
                  <td className="px-3 py-1.5 max-w-xs truncate text-gray-600 dark:text-gray-300" title={event.message}>{event.message}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{event.count}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">
                    {event.last_seen ? new Date(event.last_seen).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PodTab({ podData }: { podData: PodInfo | null }) {
  if (!podData) {
    return (
      <div className="p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">Pod not found. The workspace may be stopped.</p>
      </div>
    );
  }

  const status = podData.status;
  const spec = podData.spec;

  const getPhaseBadge = (phase: string) => {
    switch (phase) {
      case "Running":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            {phase}
          </span>
        );
      case "Pending":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {phase}
          </span>
        );
      case "Succeeded":
      case "Completed":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
            {phase}
          </span>
        );
      case "Failed":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {phase}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {phase}
          </span>
        );
    }
  };

  const getContainerStateDisplay = (cs: ContainerStatus) => {
    if (cs.state?.running) {
      return (
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Running
          {cs.state.running.startedAt && (
            <span className="text-gray-400 dark:text-gray-500">
              since {new Date(cs.state.running.startedAt).toLocaleString()}
            </span>
          )}
        </span>
      );
    }
    if (cs.state?.waiting) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Waiting: {cs.state.waiting.reason || "Unknown"}
          {cs.state.waiting.message && (
            <span className="text-gray-400 dark:text-gray-500">- {cs.state.waiting.message}</span>
          )}
        </span>
      );
    }
    if (cs.state?.terminated) {
      const t = cs.state.terminated;
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Terminated: {t.reason || `Exit ${t.exitCode}`}
          {t.message && (
            <span className="text-gray-400 dark:text-gray-500">- {t.message}</span>
          )}
        </span>
      );
    }
    return <span className="text-gray-400 dark:text-gray-500">Unknown</span>;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Pod Status Overview */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Pod Status</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Phase</dt>
            <dd className="mt-0.5">{status ? getPhaseBadge(status.phase) : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Pod IP</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white font-mono text-xs">{status?.podIP || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Node</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white text-xs">{spec?.nodeName || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Host IP</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white font-mono text-xs">{status?.hostIP || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">QoS Class</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white text-xs">{status?.qosClass || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Restart Policy</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white text-xs">{spec?.restartPolicy || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Service Account</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white text-xs font-mono">{spec?.serviceAccountName || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Time</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white text-xs">
              {status?.startTime ? new Date(status.startTime).toLocaleString() : "-"}
            </dd>
          </div>
        </dl>
      </div>

      {status?.reason && (
        <div className="border border-amber-200 dark:border-amber-800 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{status.reason}</p>
          {status.message && <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{status.message}</p>}
        </div>
      )}

      {/* Container Statuses */}
      {status?.containerStatuses && status.containerStatuses.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Containers</h3>
          <div className="space-y-2">
            {status.containerStatuses.map((cs) => (
              <div
                key={cs.name}
                className="border border-gray-200 dark:border-gray-800 rounded-md p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-900 dark:text-white">{cs.name}</span>
                    {cs.ready ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Ready
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Not Ready
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Restarts: {cs.restartCount}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                  {getContainerStateDisplay(cs)}
                </div>
                <div className="mt-1">
                  <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 break-all">Image: {cs.image}</span>
                </div>
                {cs.containerID && (
                  <div className="mt-0.5">
                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 break-all">Container ID: {cs.containerID}</span>
                  </div>
                )}
                {cs.lastState?.terminated && (
                  <div className="mt-1 border-t border-gray-100 dark:border-gray-800 pt-1">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      Last state: terminated ({cs.lastState.terminated.reason || `exit ${cs.lastState.terminated.exitCode}`})
                    </span>
                  </div>
                )}
                {cs.started !== undefined && !cs.started && (
                  <div className="mt-1">
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      Container has not started
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pod Conditions */}
      {status?.conditions && status.conditions.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Pod Conditions</h3>
          <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-1.5 font-medium">Type</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                  <th className="px-3 py-1.5 font-medium">Last Transition</th>
                  <th className="px-3 py-1.5 font-medium">Reason</th>
                  <th className="px-3 py-1.5 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="text-gray-900 dark:text-white divide-y divide-gray-100 dark:divide-gray-800/50">
                {status.conditions.map((c, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-medium">{c.type}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        c.status === "True"
                          ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : c.status === "False"
                          ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">
                      {c.lastTransitionTime ? new Date(c.lastTransitionTime).toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{c.reason || "-"}</td>
                    <td className="px-3 py-1.5 max-w-[200px] truncate text-gray-500 dark:text-gray-400" title={c.message}>{c.message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pod Spec Containers */}
      {spec?.containers && spec.containers.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Spec Containers</h3>
          <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-1.5 font-medium">Name</th>
                  <th className="px-3 py-1.5 font-medium">Image</th>
                  <th className="px-3 py-1.5 font-medium">CPU Request</th>
                  <th className="px-3 py-1.5 font-medium">CPU Limit</th>
                  <th className="px-3 py-1.5 font-medium">Mem Request</th>
                  <th className="px-3 py-1.5 font-medium">Mem Limit</th>
                </tr>
              </thead>
              <tbody className="text-gray-900 dark:text-white divide-y divide-gray-100 dark:divide-gray-800/50">
                {spec.containers.map((c, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-medium">{c.name}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400 max-w-[300px] truncate" title={c.image}>{c.image}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{c.resources?.requests?.cpu || "-"}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{c.resources?.limits?.cpu || "-"}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{c.resources?.requests?.memory || "-"}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{c.resources?.limits?.memory || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricsTab({ data, window: win, onWindowChange, error }: { data: PodMetricsResponse | null; window: string; onWindowChange: (w: string) => void; error: string | null }) {
  if (!data) {
    return (
      <div className="p-4">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading metrics...</div>
      </div>
    );
  }

  const isUnavailable = error && error.includes("not available");

  if (isUnavailable) {
    return (
      <div className="p-4">
        <div className="border border-gray-200 dark:border-gray-800 rounded-md p-4 text-center">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Metrics server not available</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Install metrics-server in the cluster to view pod resource usage.
          </p>
        </div>
      </div>
    );
  }

  if (data.message && data.points.length === 0) {
    return (
      <div className="p-4">
        <div className="border border-gray-200 dark:border-gray-800 rounded-md p-4 text-center">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{data.message}</p>
        </div>
      </div>
    );
  }

  const windows = ["5m", "15m", "1h", "3h", "6h", "24h"];

  const chartPoints = data.points.map((p: PodMetricPoint) => ({
    time: new Date(p.timestamp).getTime(),
    label: formatTimeLabel(p.timestamp, win),
    cpu: p.cpu_mc,
    memory: p.memory_bytes / (1024 * 1024),
  }));

  const cpuMax = Math.max(...chartPoints.map((p) => p.cpu), 100);
  const memMax = Math.max(...chartPoints.map((p) => p.memory), 1);

  return (
    <div className="p-4 space-y-4">
      {error && !isUnavailable && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Container: {data.container}
        </span>
        <div className="flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-gray-700 p-0.5">
          {windows.map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                win === w
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">CPU Usage</h3>
        <div className="border border-gray-200 dark:border-gray-800 rounded-md p-3 bg-gray-50 dark:bg-gray-900/50">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartPoints} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-800" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-gray-400 dark:text-gray-500"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-gray-400 dark:text-gray-500"
                domain={[0, Math.ceil(cpuMax * 1.1)]}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}c` : `${v.toFixed(0)}m`}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  backgroundColor: "var(--tooltip-bg, #fff)",
                  border: "1px solid var(--tooltip-border, #e5e7eb)",
                  borderRadius: 6,
                }}
                formatter={(value: unknown) => {
                  const v = Number(value) || 0;
                  return [v >= 1000 ? `${(v / 1000).toFixed(2)} cores` : `${v.toFixed(0)}m`, "CPU"];
                }}
                labelFormatter={(label: unknown) => `Time: ${String(label || "")}`}
              />
              <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Memory Usage</h3>
        <div className="border border-gray-200 dark:border-gray-800 rounded-md p-3 bg-gray-50 dark:bg-gray-900/50">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartPoints} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-800" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-gray-400 dark:text-gray-500"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-gray-400 dark:text-gray-500"
                domain={[0, Math.ceil(memMax * 1.1)]}
                tickFormatter={(v: number) => v >= 1024 ? `${(v / 1024).toFixed(1)}Gi` : `${v.toFixed(0)}Mi`}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  backgroundColor: "var(--tooltip-bg, #fff)",
                  border: "1px solid var(--tooltip-border, #e5e7eb)",
                  borderRadius: 6,
                }}
                formatter={(value: unknown) => {
                  const v = Number(value) || 0;
                  return [`${v.toFixed(1)} MiB`, "Memory"];
                }}
                labelFormatter={(label: unknown) => `Time: ${String(label || "")}`}
              />
              <Line type="monotone" dataKey="memory" stroke="#22c55e" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function formatTimeLabel(ts: string, window: string): string {
  const d = new Date(ts);
  if (window === "5m" || window === "15m") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (window === "1h" || window === "3h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...obj };
  // Remove metadata fields that are managed/ephemeral
  if (cleaned.metadata && typeof cleaned.metadata === "object") {
    const meta = { ...(cleaned.metadata as Record<string, unknown>) };
    delete meta.managedFields;
    delete meta.uid;
    delete meta.resourceVersion;
    delete meta.generation;
    delete meta.creationTimestamp;
    delete meta.ownerReferences;
    delete meta.generateName;
    delete meta.labels;
    delete meta.annotations;
    cleaned.metadata = meta;
  }
  // Remove status if present (ephemeral runtime state)
  delete cleaned.status;
  return cleaned;
}

function YamlTab({
  crData,
  podData,
  yamlView,
  setYamlView,
  cleanYaml,
  setCleanYaml,
  onRefresh,
}: {
  crData: object | null;
  podData: PodInfo | null;
  yamlView: "workspace" | "pod";
  setYamlView: (v: "workspace" | "pod") => void;
  cleanYaml: boolean;
  setCleanYaml: (v: boolean) => void;
  onRefresh: () => void;
}) {
  const data = yamlView === "workspace" ? crData : podData;
  let content: string;

  if (!data) {
    content = yamlView === "pod" ? "Pod not found (workspace may be stopped)" : "No data available";
  } else {
    const obj = cleanYaml ? cleanObject(data as Record<string, unknown>) : data;
    content = yamlStringify(obj, { lineWidth: 120 });
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="flex gap-1">
          <button
            onClick={() => setYamlView("workspace")}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              yamlView === "workspace"
                ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Workspace CR
          </button>
          <button
            onClick={() => setYamlView("pod")}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              yamlView === "pod"
                ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Pod
          </button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={cleanYaml}
              onChange={(e) => setCleanYaml(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-[var(--color-primary)] focus:ring-[var(--color-primary-muted)] w-3.5 h-3.5"
            />
            Clean
          </label>
          <button
            onClick={onRefresh}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
      </div>
      <pre className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-3 rounded-md overflow-x-auto text-xs font-mono max-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed border border-gray-200 dark:border-gray-800">
        {content}
      </pre>
    </div>
  );
}

function EditModal({
  open,
  form,
  setForm,
  volumes,
  onSave,
  onCancel,
  saving,
}: {
  open: boolean;
  form: {
    image: string;
    port: number;
    cpu_request: string;
    memory_request: string;
    cpu_limit: string;
    memory_limit: string;
    volume_mounts: { name: string; mountPath: string }[];
  };
  setForm: (f: typeof form) => void;
  volumes: Volume[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  if (!open) return null;

  const inputClass = "mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white px-3 py-2 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-muted)] outline-none transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Edit Workspace</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Image</label>
            <input
              type="text"
              value={form.image}
              onChange={(e) => setForm({ ...form, image: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Port</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 8080 })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Resources</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-gray-400 dark:text-gray-500">CPU Request</label>
                <input type="text" value={form.cpu_request} onChange={(e) => setForm({ ...form, cpu_request: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 dark:text-gray-500">Memory Request</label>
                <input type="text" value={form.memory_request} onChange={(e) => setForm({ ...form, memory_request: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 dark:text-gray-500">CPU Limit</label>
                <input type="text" value={form.cpu_limit} onChange={(e) => setForm({ ...form, cpu_limit: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 dark:text-gray-500">Memory Limit</label>
                <input type="text" value={form.memory_limit} onChange={(e) => setForm({ ...form, memory_limit: e.target.value })} className={inputClass} />
              </div>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Volumes</label>
              <button
                type="button"
                onClick={() => setForm({ ...form, volume_mounts: [...form.volume_mounts, { name: "", mountPath: "/data" }] })}
                className="text-[10px] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium"
              >
                + Add Volume
              </button>
            </div>
            {form.volume_mounts.map((vm, i) => (
              <div key={i} className="flex gap-2 mb-2 items-end">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 dark:text-gray-500">PVC Name</label>
                  <select
                    value={vm.name}
                    onChange={(e) => {
                      const updated = [...form.volume_mounts];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setForm({ ...form, volume_mounts: updated });
                    }}
                    className={inputClass}
                  >
                    <option value="">Select...</option>
                    {volumes.map((v) => (
                      <option key={v.name} value={v.name}>{v.name} ({v.size})</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 dark:text-gray-500">Mount Path</label>
                  <input
                    type="text"
                    value={vm.mountPath}
                    onChange={(e) => {
                      const updated = [...form.volume_mounts];
                      updated[i] = { ...updated[i], mountPath: e.target.value };
                      setForm({ ...form, volume_mounts: updated });
                    }}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, volume_mounts: form.volume_mounts.filter((_, j) => j !== i) })}
                  className="text-[10px] text-red-500 hover:text-red-700 px-2 py-2"
                >
                  Remove
                </button>
              </div>
            ))}
            {form.volume_mounts.length === 0 && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500">No volumes attached.</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.image}
            className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
