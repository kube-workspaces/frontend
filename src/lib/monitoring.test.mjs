import assert from "node:assert/strict";
import { test } from "node:test";
import { monitoringSummary, historyChart } from "./monitoring.ts";

test("counts distinct connected workspaces and excludes HTTP/reservations", () => {
  const workspaces = [
    { uid: "vm", state: "running", connections: [
      { state: "established", category: "display", tier: "0" },
      { state: "established", category: "agent", tier: "1" },
      { state: "established", category: "console" },
      { state: "connecting", category: "display", tier: "0" },
      { state: "established", category: "http" },
    ], to_workspace_bytes_per_second: 10, to_client_bytes_per_second: 20 },
    { uid: "idle", state: "running", connections: [], to_workspace_bytes_per_second: 0, to_client_bytes_per_second: 0 },
  ];
  assert.deepEqual(monitoringSummary(workspaces), { running: 2, connected: 1, connections: 3, tier0: 1, tier1: 1, http: 1, towardWorkspace: 10, towardClient: 20 });
});

test("history preserves missing samples and separates tier/transport series", () => {
  const chart = historyChart({ status: "success", data: { resultType: "matrix", result: [
    { metric: { tier: "0", transport: "rfb" }, values: [[1, "3"], [2, "NaN"]] },
    { metric: { tier: "1", transport: "agent" }, values: [[2, "2"]] },
  ] } });
  assert.deepEqual(chart.rows, [{ timestamp: 1000, series0: 3 }, { timestamp: 2000, series1: 2 }]);
  assert.equal(chart.series[1].label, "Tier 1 · agent");
  assert.throws(() => historyChart({ status: "error" }), /Invalid monitoring/);
});
