export interface MonitoringConnection {
  id: string;
  workspace_uid: string;
  namespace: string;
  name: string;
  workspace_type: string;
  category: string;
  transport: string;
  tier?: string;
  role?: string;
  user?: string;
  byte_layer: string;
  state: string;
  started_at: string;
  connected_at?: string;
  last_activity?: string;
  to_workspace_bytes: number;
  to_client_bytes: number;
  media_observed: boolean;
  guest_admitted: boolean;
  owner: string;
  component: string;
}

export interface MonitoringWorkspace {
  uid: string;
  namespace: string;
  name: string;
  type: string;
  state: string;
  connections: MonitoringConnection[];
  to_workspace_bytes_per_second: number;
  to_client_bytes_per_second: number;
}

export interface MonitoringSnapshot {
	components?: Record<string, { ready: number; total: number; status: string; version: string }>;
	setup_failures: number;
  observed_at: string;
  complete: boolean;
  rates_ready: boolean;
  workspaces: MonitoringWorkspace[];
  sources: { owner: string; component: string; available: boolean; observed_at?: string; message?: string }[];
  messages: string[];
  history_configured: boolean;
}

export function establishedConnections(workspace: MonitoringWorkspace) {
  return workspace.connections.filter((c) => c.state === "established" && c.category !== "http");
}

export function monitoringSummary(workspaces: MonitoringWorkspace[]) {
  const connections = workspaces.flatMap(establishedConnections);
  return {
    running: workspaces.filter((w) => w.state === "running").length,
    connected: new Set(workspaces.filter((w) => establishedConnections(w).length > 0).map((w) => w.uid)).size,
    connections: connections.length,
    tier0: connections.filter((c) => c.tier === "0").length,
    tier1: connections.filter((c) => c.tier === "1").length,
    http: workspaces.flatMap((w) => w.connections).filter((c) => c.category === "http").length,
    towardWorkspace: workspaces.reduce((n, w) => n + w.to_workspace_bytes_per_second, 0),
    towardClient: workspaces.reduce((n, w) => n + w.to_client_bytes_per_second, 0),
  };
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let n = value / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

export interface HistoryResult {
  status: string;
  data?: { resultType: string; result: { metric: Record<string, string>; values: [number, string][] }[] };
}

export function historyChart(result: HistoryResult) {
  if (result.status !== "success" || result.data?.resultType !== "matrix") throw new Error("Invalid monitoring history response");
  const directionLabel = (d?: string) => d === "toward_workspace" ? "Toward workspaces" : d === "toward_client" ? "Toward clients" : "";
  const rows = new Map<number, Record<string, number>>();
  const series = result.data.result.map((item, index) => {
    const key = `series${index}`;
    const base = [item.metric.tier ? `Tier ${item.metric.tier}` : "", item.metric.transport || item.metric.category || ""].filter(Boolean).join(" · ");
    const label = [base, directionLabel(item.metric.direction)].filter(Boolean).join(" · ") || item.metric.__name__ || "Platform";
    for (const [timestamp, value] of item.values) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      const row = rows.get(timestamp) || { timestamp: timestamp * 1000 };
      row[key] = n;
      rows.set(timestamp, row);
    }
    return { key, label };
  });
  return { series, rows: [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row) };
}
