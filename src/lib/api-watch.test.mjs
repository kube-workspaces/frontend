import assert from "node:assert/strict";
import { test } from "node:test";
import { watchWorkspaces } from "./api.ts";

class FakeEventSource extends EventTarget {
  static instances = [];
  closed = false;
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    FakeEventSource.instances.push(this);
  }
  close() { this.closed = true; }
  snapshot(data) { this.dispatchEvent(new MessageEvent("snapshot", { data })); }
}

function setup(t, fetchImpl = async () => Response.json([])) {
  const original = globalThis.EventSource;
  globalThis.EventSource = FakeEventSource;
  FakeEventSource.instances = [];
  t.after(() => { globalThis.EventSource = original; });
  t.mock.method(globalThis, "fetch", fetchImpl);
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test("workspace watch authenticates, reconnects with polling fallback, and cleans up", async (t) => {
  setup(t);
  const snapshots = [];
  const stop = watchWorkspaces("team", (items) => snapshots.push(items), (err) => assert.fail(err));
  t.after(stop);
  await flush();
  const source = FakeEventSource.instances[0];
  assert.equal(source.options.withCredentials, true);
  assert.match(source.url, /namespace=team/);
  source.snapshot('[{"name":"live"}]');
  await flush();
  const calls = fetch.mock.calls.length;
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(fetch.mock.calls.length, calls, "healthy watch still polls");
  source.onerror();
  assert.equal(source.closed, true);
  await flush();
  assert.ok(fetch.mock.calls.length > calls);
  t.mock.timers.tick(1000);
  assert.equal(FakeEventSource.instances.length, 2);
  const next = FakeEventSource.instances[1];
  next.snapshot("[]");
  stop();
  const count = snapshots.length;
  source.snapshot('[{"name":"stale"}]');
  next.snapshot('[{"name":"late"}]');
  t.mock.timers.tick(30000);
  await flush();
  assert.equal(snapshots.length, count);
  assert.equal(next.closed, true);
  assert.equal(fetch.mock.calls[0].arguments[1].credentials, "include");
  assert.equal(fetch.mock.calls[0].arguments[1].signal.aborted, true);
});

test("a late polling response cannot overwrite a newer watch snapshot", async (t) => {
  let resolve;
  setup(t, () => new Promise((done) => { resolve = done; }));
  const snapshots = [];
  const stop = watchWorkspaces("team", (items) => snapshots.push(items), (err) => assert.fail(err));
  t.after(stop);
  FakeEventSource.instances[0].snapshot('[{"name":"new"}]');
  resolve(Response.json([{ name: "old" }]));
  await flush();
  assert.deepEqual(snapshots, [[{ name: "new" }]]);
});

test("malformed snapshots close the stream and activate fallback", async (t) => {
  setup(t);
  const stop = watchWorkspaces("_all", () => {}, (err) => assert.fail(err));
  t.after(stop);
  await flush();
  const source = FakeEventSource.instances[0];
  source.snapshot("not-json");
  assert.equal(source.closed, true);
  t.mock.timers.tick(1000);
  assert.equal(FakeEventSource.instances.length, 2);
});
