"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { listWorkspaces, listImages, listVolumes, WorkspaceImage } from "@/lib/api";

// --- Types ---

interface Workspace {
  name: string;
  namespace: string;
  image: string;
  port?: number;
  ready_replicas: number;
  stopped: boolean;
  volume_mounts?: { name: string; mount_path: string }[];
}

interface Volume {
  name: string;
  namespace: string;
  capacity?: string;
  status?: string;
}

type NodeType = "ingress" | "frontend" | "proxy" | "service" | "pod" | "port" | "volume";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: NodeType;
  status?: "running" | "stopped" | "starting" | "error";
  metadata?: Record<string, string>;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  label?: string;
  animated?: boolean;
}

// --- Color/styling maps ---

const NODE_COLORS: Record<NodeType, { fill: string; stroke: string }> = {
  ingress: { fill: "#6366f1", stroke: "#4338ca" },     // indigo
  frontend: { fill: "#8b5cf6", stroke: "#6d28d9" },    // violet
  proxy: { fill: "#06b6d4", stroke: "#0891b2" },       // cyan
  service: { fill: "#10b981", stroke: "#059669" },     // emerald
  pod: { fill: "#f59e0b", stroke: "#d97706" },         // amber
  port: { fill: "#ef4444", stroke: "#dc2626" },        // red
  volume: { fill: "#8b5cf6", stroke: "#7c3aed" },      // purple
};

const NODE_RADIUS: Record<NodeType, number> = {
  ingress: 30,
  frontend: 24,
  proxy: 26,
  service: 22,
  pod: 20,
  port: 14,
  volume: 16,
};

// --- Graph builder ---

function buildGraph(
  workspaces: Workspace[],
  _images: WorkspaceImage[],
  volumes: Volume[]
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Static infrastructure nodes
  nodes.push({
    id: "ingress",
    label: "Nginx Ingress",
    type: "ingress",
    metadata: { host: "workspaces.fordham.id.au", ports: "443" },
  });
  nodes.push({
    id: "frontend",
    label: "Frontend",
    type: "frontend",
    metadata: { service: "kube-workspaces-frontend", port: "3000" },
  });
  nodes.push({
    id: "proxy",
    label: "Proxy",
    type: "proxy",
    metadata: { service: "kube-workspaces-proxy", port: "8080" },
  });

  // Ingress -> Frontend (catch-all)
  links.push({
    id: "ingress-frontend",
    source: "ingress",
    target: "frontend",
    label: "/ (catch-all)",
  });
  // Ingress -> Proxy (/proxy)
  links.push({
    id: "ingress-proxy",
    source: "ingress",
    target: "proxy",
    label: "/proxy/*",
    animated: true,
  });

  // Running workspaces
  for (const ws of workspaces) {
    const svcId = `svc-${ws.namespace}-${ws.name}`;
    const podId = `pod-${ws.namespace}-${ws.name}`;

    const isRunning = ws.ready_replicas > 0;
    const status = ws.stopped ? "stopped" : isRunning ? "running" : "starting";

    // Service node
    nodes.push({
      id: svcId,
      label: `${ws.name}`,
      type: "service",
      status,
      metadata: {
        namespace: ws.namespace,
        name: ws.name,
        type: "ClusterIP",
      },
    });

    // Pod node
    nodes.push({
      id: podId,
      label: `${ws.name}-0`,
      type: "pod",
      status,
      metadata: {
        namespace: ws.namespace,
        image: ws.image,
        port: String(ws.port || 80),
      },
    });

    // Proxy -> Service (only for running workspaces)
    if (!ws.stopped) {
      links.push({
        id: `proxy-${svcId}`,
        source: "proxy",
        target: svcId,
        label: `/${ws.namespace}/${ws.name}`,
        animated: isRunning,
      });
    }

    // Service -> Pod
    links.push({
      id: `${svcId}-${podId}`,
      source: svcId,
      target: podId,
      label: ws.port ? `:80->${ws.port}` : ":80",
    });

    // Port nodes for pods with ports
    if (ws.port) {
      const portId = `port-${ws.namespace}-${ws.name}-${ws.port}`;
      nodes.push({
        id: portId,
        label: String(ws.port),
        type: "port",
        status,
        metadata: { protocol: "TCP" },
      });
      links.push({
        id: `${podId}-${portId}`,
        source: podId,
        target: portId,
      });
    }

    // Volume nodes
    if (ws.volume_mounts) {
      for (const vm of ws.volume_mounts) {
        const volId = `vol-${ws.namespace}-${vm.name}`;
        // Only add volume node if not already present
        if (!nodes.find((n) => n.id === volId)) {
          const volInfo = volumes.find(
            (v) => v.name === vm.name && v.namespace === ws.namespace
          );
          nodes.push({
            id: volId,
            label: vm.name,
            type: "volume",
            metadata: {
              mountPath: vm.mount_path,
              capacity: volInfo?.capacity || "?",
              status: volInfo?.status || "unknown",
            },
          });
        }
        links.push({
          id: `${podId}-${volId}`,
          source: podId,
          target: volId,
          label: vm.mount_path,
        });
      }
    }
  }

  return { nodes, links };
}

// --- Detail panel ---

function DetailPanel({
  node,
  onClose,
}: {
  node: GraphNode | null;
  onClose: () => void;
}) {
  if (!node) return null;

  return (
    <div className="absolute top-4 right-4 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-50">
      <div className="flex justify-between items-start mb-3">
        <div>
          <span
            className="inline-block w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: NODE_COLORS[node.type].fill }}
          />
          <span className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            {node.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
        {node.label}
      </h3>
      {node.status && (
        <div className="mb-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              node.status === "running"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : node.status === "stopped"
                ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
            }`}
          >
            {node.status}
          </span>
        </div>
      )}
      {node.metadata && (
        <dl className="text-xs space-y-1">
          {Object.entries(node.metadata).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">{key}</dt>
              <dd className="text-gray-900 dark:text-white font-mono truncate ml-2 max-w-[140px]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// --- Main component ---

export default function MapPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [polling, setPolling] = useState(() => {
    if (typeof window === "undefined") return true;
    try { const v = localStorage.getItem("admin-map-live"); return v !== null ? v === "true" : true; } catch { return true; }
  });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const [runningCount, setRunningCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showStopped, setShowStopped] = useState(() => {
    if (typeof window === "undefined") return true;
    try { const v = localStorage.getItem("admin-map-show-stopped"); return v !== null ? v === "true" : true; } catch { return true; }
  });
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  // D3 rendering
  const renderGraph = useCallback((nodes: GraphNode[], links: GraphLink[]) => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous
    svg.selectAll("*").remove();

    // Add defs for arrow markers and animation
    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#9ca3af");

    // Container group for zoom/pan
    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Force simulation
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => NODE_RADIUS[(d as GraphNode).type] + 10))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05));

    simulationRef.current = simulation;

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#6b7280")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.6)
      .attr("marker-end", "url(#arrowhead)")
      .attr("stroke-dasharray", (d) => (d.animated ? "5,5" : "none"));

    // Animated dash offset for active links
    function animateLinks() {
      link
        .filter((d) => !!d.animated)
        .attr("stroke-dashoffset", function () {
          const current = parseFloat(d3.select(this).attr("stroke-dashoffset") || "0");
          return String(current - 0.5);
        });
      requestAnimationFrame(animateLinks);
    }
    animateLinks();

    // Link labels
    const linkLabel = g
      .append("g")
      .selectAll("text")
      .data(links.filter((l) => l.label))
      .join("text")
      .attr("font-size", 9)
      .attr("fill", "#9ca3af")
      .attr("text-anchor", "middle")
      .text((d) => d.label || "");

    // Node groups
    const node = g
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on("click", (_event, d) => {
        setSelectedNode(d);
      });

    // Node circles
    node
      .append("circle")
      .attr("r", (d) => NODE_RADIUS[d.type])
      .attr("fill", (d) => {
        if (d.status === "stopped") return "#6b7280";
        return NODE_COLORS[d.type].fill;
      })
      .attr("stroke", (d) => {
        if (d.status === "stopped") return "#4b5563";
        return NODE_COLORS[d.type].stroke;
      })
      .attr("stroke-width", 2)
      .attr("opacity", (d) => (d.status === "stopped" ? 0.5 : 1));

    // Node icon text (type abbreviation)
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", (d) => (NODE_RADIUS[d.type] > 20 ? 10 : 8))
      .attr("fill", "white")
      .attr("font-weight", "bold")
      .attr("pointer-events", "none")
      .text((d) => {
        switch (d.type) {
          case "ingress": return "ING";
          case "frontend": return "FE";
          case "proxy": return "PRX";
          case "service": return "SVC";
          case "pod": return "POD";
          case "port": return d.label;
          case "volume": return "VOL";
        }
      });

    // Node labels below
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => NODE_RADIUS[d.type] + 14)
      .attr("font-size", 10)
      .attr("fill", "#d1d5db")
      .attr("pointer-events", "none")
      .text((d) => d.type === "port" ? "" : d.label);

    // Simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => ((d.source as GraphNode).x ?? 0))
        .attr("y1", (d) => ((d.source as GraphNode).y ?? 0))
        .attr("x2", (d) => ((d.target as GraphNode).x ?? 0))
        .attr("y2", (d) => ((d.target as GraphNode).y ?? 0));

      linkLabel
        .attr("x", (d) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2)
        .attr("y", (d) => (((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2 - 5);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
  }, []);

  // Initial load and polling
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [workspaces, images, volumes] = await Promise.all([
          listWorkspaces("_all"),
          listImages(),
          listVolumes("_all"),
        ]);
        if (cancelled) return;
        setWorkspaceCount(workspaces.length);
        setRunningCount(workspaces.filter((w: Workspace) => w.ready_replicas > 0).length);
        setLastUpdate(new Date());
        const filtered = showStopped ? workspaces : workspaces.filter((w: Workspace) => !w.stopped);
        const { nodes, links } = buildGraph(filtered, images, volumes);
        renderGraph(nodes, links);
      } catch (err) {
        console.error("Failed to fetch map data:", err);
      }
    })();

    if (!polling) return () => { cancelled = true; };

    const interval = setInterval(async () => {
      try {
        const [workspaces, images, volumes] = await Promise.all([
          listWorkspaces("_all"),
          listImages(),
          listVolumes("_all"),
        ]);
        if (cancelled) return;
        setWorkspaceCount(workspaces.length);
        setRunningCount(workspaces.filter((w: Workspace) => w.ready_replicas > 0).length);
        setLastUpdate(new Date());
        const filtered = showStopped ? workspaces : workspaces.filter((w: Workspace) => !w.stopped);
        const { nodes, links } = buildGraph(filtered, images, volumes);
        renderGraph(nodes, links);
      } catch (err) {
        console.error("Failed to fetch map data:", err);
      }
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [polling, renderGraph, refreshTrigger, showStopped]);

  return (
    <div className="relative h-[calc(100vh-8rem)]">
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
            Infrastructure Map
          </h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {workspaceCount} workspaces ({runningCount} running)
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-gray-400">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => { const next = !showStopped; setShowStopped(next); try { localStorage.setItem("admin-map-show-stopped", String(next)); } catch {} }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              showStopped
                ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            {showStopped ? "Hide Stopped" : "Show Stopped"}
          </button>
          <button
            onClick={() => { const next = !polling; setPolling(next); try { localStorage.setItem("admin-map-live", String(next)); } catch {} }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              polling
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                polling ? "bg-green-500 animate-pulse" : "bg-gray-400"
              }`}
            />
            {polling ? "Live" : "Paused"}
          </button>
          <button
            onClick={() => setRefreshTrigger((n) => n + 1)}
            className="px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {(Object.keys(NODE_COLORS) as NodeType[]).map((type) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: NODE_COLORS[type].fill }}
              />
              <span className="text-xs text-gray-600 dark:text-gray-300 capitalize">
                {type}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="w-6 border-t-2 border-dashed border-gray-400" />
            <span className="text-xs text-gray-500">Active traffic</span>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full bg-gray-50 dark:bg-gray-950"
        onClick={(e) => {
          if (e.target === svgRef.current) setSelectedNode(null);
        }}
      />
    </div>
  );
}
