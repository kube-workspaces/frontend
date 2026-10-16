import test from "node:test";
import assert from "node:assert/strict";
import { initialResolution, resolutionReducer as reduce } from "./guest-resolution.ts";

const oldMode = { width: 1280, height: 720 };
const newMode = { width: 1920, height: 1080 };
const live = () => reduce(initialResolution, { type: "frame", size: oldMode });

test("guest mode requires delivered output and handles ACK/frame in either order", () => {
  for (const frameFirst of [true, false]) {
    let state = reduce(live(), { type: "request", id: "a", size: newMode });
    assert.deepEqual(state.actual, oldMode);
    const ack = { type: "ack", id: "a", actual: newMode };
    const frame = { type: "frame", size: newMode };
    state = reduce(state, frameFirst ? frame : ack);
    if (!frameFirst) assert.deepEqual(state.actual, oldMode);
    assert.notEqual(state.pending, null);
    state = reduce(state, frameFirst ? ack : frame);
    assert.deepEqual(state.actual, newMode);
    assert.equal(state.pending, null);
  }
});

test("stale replies and timers cannot complete a newer selection or a reconnect", () => {
  let state = reduce(live(), { type: "request", id: "a", size: newMode });
  state = reduce(state, { type: "request", id: "b", size: oldMode });
  assert.equal(reduce(state, { type: "ack", id: "a", actual: newMode }), state);
  assert.equal(reduce(state, { type: "timeout", id: "a" }), state);
  state = reduce(state, { type: "reset" });
  assert.equal(reduce(state, { type: "ack", id: "b", actual: oldMode }), state);
});

test("clamps, rejection and timeouts preserve actual mode and explain the result", () => {
  let state = reduce(live(), { type: "request", id: "a", size: newMode });
  state = reduce(state, { type: "ack", id: "a", actual: oldMode, reason: "clamped" });
  assert.deepEqual(state.actual, oldMode);
  assert.match(state.note, /Requested 1920×1080; guest reports 1280×720 \(clamped\)/);
  state = reduce(state, { type: "request", id: "b", size: newMode });
  state = reduce(state, { type: "ack", id: "b", actual: null, reason: "unsupported" });
  assert.match(state.note, /not applied \(unsupported\)/);
  assert.deepEqual(state.actual, oldMode);
  state = reduce(state, { type: "request", id: "c", size: newMode });
  state = reduce(state, { type: "timeout", id: "c" });
  assert.deepEqual(state.actual, oldMode);
  assert.equal(state.pending, null);
  assert.match(state.note, /timed out/);
});
