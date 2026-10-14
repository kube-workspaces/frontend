"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_BASE } from "@/lib/api";
import { establishedConnections, formatBytes, historyChart, monitoringSummary, type HistoryResult, type MonitoringSnapshot, type MonitoringWorkspace } from "@/lib/monitoring";

const panel = "rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900";
const field = "rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white";

export default function AdminMonitoringPage() {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [namespace, setNamespace] = useState("");
  const [type, setType] = useState("");
  const [tier, setTier] = useState("");
  const [transport, setTransport] = useState("");
  const [search, setSearch] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [refresh, setRefresh] = useState(0);
	const [checkedAt, setCheckedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let backoff = 5000;
    const controller = new AbortController();
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "hidden") {
        try {
          const res = await fetch(`${API_BASE}/admin/monitoring/overview`, { credentials: "include", cache: "no-store", signal: controller.signal });
          if (!res.ok) throw new Error(`Monitoring request failed (${res.status})`);
          const data: MonitoringSnapshot = await res.json();
          if (!Array.isArray(data.workspaces) || !Array.isArray(data.sources)) throw new Error("Invalid monitoring response");
          if (!cancelled) { setSnapshot(data); setError(null); }
          backoff = 5000;
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Monitoring unavailable");
          backoff = Math.min(backoff * 2, 30000);
        }
      }
		if (!cancelled) setCheckedAt(Date.now());
      if (!cancelled) timer = setTimeout(poll, backoff);
    };
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [refresh]);

  const workspaces = snapshot?.workspaces || [];
  const namespaces = [...new Set(workspaces.map((w) => w.namespace))].sort();
  const transports = [...new Set(workspaces.flatMap((w) => w.connections.map((c) => c.transport)))].sort();
  const visible = workspaces.filter((w) => {
    if (namespace && w.namespace !== namespace) return false;
    if (type && w.type !== type) return false;
    if (search && !`${w.namespace}/${w.name}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (connectedOnly && !establishedConnections(w).length) return false;
    // Match tier + transport against the same connection.
    if ((tier || transport) && !w.connections.some((c) => (!tier || c.tier === tier) && (!transport || c.transport === transport))) return false;
    return true;
  });
  const summary = monitoringSummary(workspaces);
  const stale = !!snapshot && (!snapshot.observed_at || checkedAt - Date.parse(snapshot.observed_at) > 15000);
  const reliable = !!snapshot && !error && !stale;
  const count = (n: number) => reliable ? String(n) : "—";
  const rate = (n: number) => reliable && snapshot?.rates_ready ? `${formatBytes(n)}/s` : "—";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Monitoring</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Live workspace connections and client-facing traffic across API and proxy replicas.</p>
        </div>
        <button className={field} onClick={() => setRefresh((n) => n + 1)}>Refresh</button>
      </header>

      {!snapshot && !error && <p className="text-sm text-gray-500">Collecting monitoring data…</p>}
      {(error || stale || (snapshot && !snapshot.complete)) && (
        <div role="status" className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">{error || (stale ? "Monitoring data is stale" : "Partial monitoring coverage")}</p>
          <p className="mt-1">{reliable ? "Counts and rates include reporting replicas only. Missing telemetry is not zero activity." : "Retained rows are the last observed snapshot; current counts and rates are unavailable."}</p>
          {snapshot?.messages.map((message) => <p key={message} className="mt-1">{message}</p>)}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="Running workspaces" value={count(summary.running)} detail={`${workspaces.filter((w) => w.type === "vm" && w.state === "running").length} VMs observed`} />
        <Stat label="Connected workspaces" value={count(summary.connected)} detail="Distinct workspace identities" />
        <Stat label="Client connections" value={count(summary.connections)} detail={`Tier 0: ${summary.tier0} · Tier 1: ${summary.tier1}`} />
        <Stat label="In-flight HTTP requests" value={count(summary.http)} detail="Separate from connected sessions" />
        <Stat label="Toward workspaces" value={rate(summary.towardWorkspace)} detail="Client → workspace" />
        <Stat label="Toward clients" value={rate(summary.towardClient)} detail="Workspace → client" />
		<Stat label="Setup failures" value={count(snapshot?.setup_failures || 0)} detail="Since reporting replicas started" />
      </div>

      <section className={`${panel} p-4 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium text-gray-900 dark:text-white">Workspaces <span className="text-sm font-normal text-gray-500">({visible.length})</span></h2>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} />Connected only</label>
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Search workspaces" className={field} placeholder="Search workspace…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Namespace" className={field} value={namespace} onChange={(e) => setNamespace(e.target.value)}><option value="">All namespaces</option>{namespaces.map((n) => <option key={n}>{n}</option>)}</select>
          <select aria-label="Workspace type" className={field} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{["container", "scratch", "vm"].map((t) => <option key={t}>{t}</option>)}</select>
          <select aria-label="Display tier" className={field} value={tier} onChange={(e) => setTier(e.target.value)}><option value="">All tiers</option><option value="0">Tier 0</option><option value="1">Tier 1</option></select>
          <select aria-label="Transport" className={field} value={transport} onChange={(e) => setTransport(e.target.value)}><option value="">All transports</option>{transports.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div className="space-y-2">
          {visible.map((w) => <WorkspaceRow key={w.uid} workspace={w} ratesReady={reliable && !!snapshot?.rates_ready} />)}
          {snapshot && visible.length === 0 && <p className="py-4 text-sm text-gray-500">No workspaces match these filters.</p>}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">HTTP measures body bytes; upgraded connections measure WebSocket stream bytes including framing and control frames. TLS/TCP/IP overhead and interface packets are separate measurements.</p>
      </section>

      <History configured={!!snapshot?.history_configured} />

      <section className={`${panel} p-4`}>
        <h2 className="font-medium text-gray-900 dark:text-white">Telemetry coverage</h2>
		<div className="mt-3 grid grid-cols-2 xl:grid-cols-4 gap-2">{Object.entries(snapshot?.components || {}).map(([name,c]) => <div key={name} className="rounded border border-gray-200 dark:border-gray-800 p-3 text-sm"><p className="font-medium text-gray-900 dark:text-white">{name}</p><p className="mt-1 text-xs text-gray-500">{c.ready}/{c.total} replicas ready · {c.version || "unknown version"}</p></div>)}</div>
        <p className="mt-1 text-xs text-gray-500">Live collection every five seconds. Replica readiness and guest/network health are separate from connection telemetry.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {snapshot?.sources.map((s) => <div key={`${s.component}/${s.owner}`} className="rounded border border-gray-200 dark:border-gray-800 p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-900 dark:text-white">{s.component}</span><span className={s.available ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>{s.available ? "Reporting" : "Unavailable"}</span></div>
            <p className="mt-1 break-all font-mono text-xs text-gray-500">{s.owner}</p>
            <p className="mt-1 text-xs text-gray-500">{s.message || (s.observed_at ? `Observed ${new Date(s.observed_at).toLocaleTimeString()}` : "Waiting for report")}</p>
          </div>)}
        </div>
        <p className="mt-3 text-xs text-gray-500">Workspace/interface network bytes and packets are available under Platform / tier history from cluster telemetry. Live bridge rows still exclude interface packets. Container CPU/memory remains available on workspace detail pages. Prometheus history: {snapshot?.history_configured ? "configured" : "not configured"}.</p>
        {snapshot?.observed_at && <p className="mt-2 text-xs text-gray-500">Snapshot: {new Date(snapshot.observed_at).toLocaleString()}</p>}
      </section>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className={`${panel} p-4`}><p className="text-xs uppercase tracking-wider text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>;
}

function WorkspaceRow({ workspace: w, ratesReady }: { workspace: MonitoringWorkspace; ratesReady: boolean }) {
  const established = establishedConnections(w);
  const transports = [...new Set(established.map((c) => `${c.tier ? `T${c.tier} ` : ""}${c.transport}`))];
  return <details className="rounded-md border border-gray-200 dark:border-gray-800">
    <summary className="cursor-pointer px-3 py-2 text-sm text-gray-900 dark:text-white">
      <span className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-center justify-between gap-2 align-middle">
        <span><span className="font-medium">{w.name}</span><span className="ml-2 text-xs text-gray-500">{w.namespace} · {w.type || "unknown"} · {w.state}</span></span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs"><span>{established.length} connected{w.connections.length > established.length ? ` · ${w.connections.length - established.length} HTTP/connecting` : ""}</span><span>{transports.join(" · ") || "No connected transport"}</span><span title="Toward workspace">↑ {ratesReady ? `${formatBytes(w.to_workspace_bytes_per_second)}/s` : "—"}</span><span title="Toward client">↓ {ratesReady ? `${formatBytes(w.to_client_bytes_per_second)}/s` : "—"}</span></span>
      </span>
    </summary>
    <div className="border-t border-gray-200 dark:border-gray-800 p-3 space-y-3">
      <Link className="text-xs text-[var(--color-primary)] hover:underline" href={`/workspaces/${encodeURIComponent(w.name)}?namespace=${encodeURIComponent(w.namespace)}`}>Open workspace</Link>
      {w.connections.map((c) => <div key={`${c.owner}/${c.id}`} className="rounded bg-gray-50 dark:bg-gray-800/50 p-3 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-gray-900 dark:text-white">{c.tier ? `Tier ${c.tier} · ` : ""}{c.transport} · {c.state}</span><span>{c.role && c.role !== "purpose_unknown" ? c.role : c.transport === "agent" ? "Purpose unclassified" : c.category}</span></div>
        <div className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
          <p>User: {c.user || "Unavailable / auth disabled"}</p><p>Owner: <span className="font-mono break-all">{c.component}/{c.owner}</span></p>
          <p>Connected: {c.connected_at ? new Date(c.connected_at).toLocaleString() : "Setup in progress"}</p><p>Last traffic: {c.last_activity ? new Date(c.last_activity).toLocaleTimeString() : "None observed"}</p>
          <p>Toward workspace: {formatBytes(c.to_workspace_bytes)}</p><p>Toward client: {formatBytes(c.to_client_bytes)}</p>
          <p>Measurement: {c.byte_layer.replaceAll("_", " ")}</p>
          {c.transport === "agent" && <p>Guest admission: {c.guest_admitted ? "confirmed" : "unconfirmed"} · Media: {c.media_observed ? "observed" : "unconfirmed"}</p>}
        </div>
      </div>)}
      {!w.connections.length && <p className="text-xs text-gray-500">No client connections or in-flight requests observed.</p>}
    </div>
  </details>;
}

function History({ configured }: { configured: boolean }) {
  const [range, setRange] = useState("1h");
  const [metric, setMetric] = useState("connections");
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (!configured || cancelled) return;
      if (document.visibilityState !== "hidden") {
        setLoading(true);
        try {
          const res = await fetch(`${API_BASE}/admin/monitoring/series?metric=${metric}&range=${range}`, { credentials: "include", cache: "no-store", signal: controller.signal });
          if (!res.ok) throw new Error(`History unavailable (${res.status})`);
          const data: HistoryResult = await res.json();
          historyChart(data);
          if (!cancelled) { setResult(data); setError(null); }
        } catch (e) { if (!cancelled) { setResult(null); setError(e instanceof Error ? e.message : "History unavailable"); } }
        finally { if (!cancelled) setLoading(false); }
      }
      if (!cancelled) timer = setTimeout(load, 30000);
    };
    void (async () => { setResult(null); setError(null); await load(); })();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [configured, metric, range]);
  const chart = useMemo(() => result ? historyChart(result) : null, [result]);
  const colors = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#14b8a6", "#e11d48"];
  const isPackets = metric.includes("packets");
  const isCounts = metric === "connections" || isPackets;
  const formatRate = (n: number) => isPackets ? `${n.toFixed(n < 10 ? 1 : 0)} pps` : `${formatBytes(Number(n))}/s`;
  return <section className={`${panel} p-4`}>
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="font-medium text-gray-900 dark:text-white">Platform / tier history</h2><div className="flex gap-2">
      <select aria-label="Historical metric" className={field} value={metric} onChange={(e) => setMetric(e.target.value)}><option value="connections">Connections</option><option value="toward_workspace">Toward workspaces</option><option value="toward_client">Toward clients</option><option value="network_container_bytes">Container net bytes</option><option value="network_container_packets">Container net packets</option><option value="network_vmi_bytes">VMI net bytes</option><option value="network_vmi_packets">VMI net packets</option></select>
      <select aria-label="History range" className={field} value={range} onChange={(e) => setRange(e.target.value)}><option value="15m">15 minutes</option><option value="1h">1 hour</option><option value="24h">24 hours</option></select>
    </div></div>
    {!configured ? <p className="mt-4 text-sm text-gray-500">Prometheus history is not configured. Live monitoring is available independently.</p> : error ? <p role="status" className="mt-4 text-sm text-amber-600 dark:text-amber-400">{error}</p> : !chart?.rows.length ? <p className="mt-4 text-sm text-gray-500">{loading ? "Loading history…" : "No historical samples available. Check API/proxy scrape targets and collection coverage."}</p> : <>
      <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart.rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#6b7280" opacity={0.2} />
        <XAxis dataKey="timestamp" tickFormatter={(n) => new Date(n).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis tickFormatter={(n) => isCounts ? String(n) : formatBytes(n)} tick={{ fontSize: 11 }} width={80} allowDecimals={metric !== "connections"} />
        <Tooltip labelFormatter={(n) => new Date(Number(n)).toLocaleString()} formatter={(n) => metric === "connections" ? String(n) : formatRate(Number(n))} />
        {chart.series.map((s, i) => <Line key={s.key} name={s.label} dataKey={s.key} stroke={colors[i % colors.length]} dot={false} isAnimationActive={false} />)}
      </LineChart></ResponsiveContainer></div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">{chart.series.map((s, i) => <span key={s.key} style={{ color: colors[i % colors.length] }}>{s.label}</span>)}</div>
    </>}
    <p className="mt-3 text-xs text-gray-500">History is scrape-sampled; brief connections may fall between scrapes. Traffic counters retain transfers after disconnect. Container/VMI network series are cluster interface counters, not proxy stream bytes; do not sum them with proxy traffic. No per-session historical timeline is stored.</p>
  </section>;
}
