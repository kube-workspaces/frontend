import assert from "node:assert/strict";
import { test } from "node:test";
import { getDisplayStatus } from "./api.ts";

for (const [label, payload] of [
  ["disabled", { enabled: false }],
  ["idle", { enabled: true }],
  ["null observers", { enabled: true, observers: null }],
  ["empty observers", { enabled: true, observers: [] }],
]) {
  test(`display status normalizes ${label} for session consumers`, async (t) => {
    const response = { protocol: 1, epoch: "", participants: 0, ...payload };
    t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.ok(url.endsWith("/v1/workspaces/windows11-pro/display/status?namespace=chris-at-fordham-id-au"));
      assert.equal(options.credentials, "include");
      return Response.json(response);
    });

    const status = await getDisplayStatus("windows11-pro", "chris-at-fordham-id-au");
    assert.deepEqual(status, { ...response, observers: [] });
    assert.equal(status.observers.length, 0);
    assert.equal(status.observers.find((o) => o.id === "viewer"), undefined);
  });
}

test("display status preserves observer and controller membership", async (t) => {
  const observer = { id: "viewer", role: "observer", connected: true, joined_at: "2026-10-16T00:00:00Z" };
  const controller = { ...observer, id: "controller", role: "controller" };
  const response = { enabled: true, protocol: 1, epoch: "session", participants: 2, observers: [observer], controller };
  t.mock.method(globalThis, "fetch", async () => Response.json(response));

  assert.deepEqual(await getDisplayStatus("windows11-pro", "team"), response);
});

test("display status propagates request failures", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "Workspace not found" }, { status: 404 }));

  await assert.rejects(getDisplayStatus("windows11-pro", "team"), /Workspace not found/);
});
