import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  annexBHasIdr,
  clampResizeSize,
  controlEnvelope,
  decodeFrame,
  desktopRequiresConsole,
  encodeControlFrame,
  keyToKeysym,
  nextSentAtNs,
  opusHead,
  playoutNext,
  snapResizeSize,
  resizeTarget,
  resolutionChoices,
  RESIZE_CONFIRMATION_TIMEOUT_MS,
} from "./agent-protocol.ts";

describe("agent frame codec", () => {
  it("round-trips a control envelope with exact framing", () => {
    const env = controlEnvelope("sess-1", 2, 123, "attach", { ticket: {} });
    const frame = encodeControlFrame(env);
    assert.equal(frame[0], 0x00);
    const decoded = decodeFrame(frame);
    assert.ok(decoded);
    assert.equal(decoded.tag, 0x00);
    const body = JSON.parse(new TextDecoder().decode(decoded.body));
    assert.equal(body.type, "attach");
    assert.equal(body.sessionId, "sess-1");
    assert.equal(body.sequence, 2);
  });

  it("rejects bad tags, empty bodies and truncated frames", () => {
    assert.equal(decodeFrame(new Uint8Array([0x09, 0, 0, 0, 1, 9])), null);
    assert.equal(decodeFrame(new Uint8Array([0x00, 0, 0, 0, 0])), null);
    assert.equal(decodeFrame(new Uint8Array([0x00, 0, 0, 0, 10, 1, 2])), null);
    assert.equal(decodeFrame(new Uint8Array([0x00, 0, 0])), null);
  });

  it("keeps the (generation, sentAtNs) fence monotonic", () => {
    const first = nextSentAtNs(0);
    assert.ok(first > 0);
    const second = nextSentAtNs(first);
    assert.ok(second > first);
  });
});

describe("manual versus automatic guest resolution", () => {
  it("keeps a fixed guest-pixel mode through viewport/fullscreen changes", () => {
    const selected = { width: 1920, height: 1080 };
    for (const [w, h] of [[640, 480], [2560, 1440], [3840, 2160]]) {
      assert.deepEqual(resizeTarget(selected, w, h, [selected]), selected);
    }
  });
  it("resumes viewport mode snapping when automatic is selected", () => {
    const modes = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }];
    assert.deepEqual(resizeTarget("auto", 1400, 900, modes), modes[0]);
    assert.deepEqual(resizeTarget("auto", 2560, 1440, modes), modes[1]);
  });
});

describe("annex-b idr detection", () => {
  it("finds an IDR NAL and ignores non-IDR slices", () => {
    const idr = new Uint8Array([0, 0, 0, 1, 0x65, 1, 2, 3]);
    const delta = new Uint8Array([0, 0, 0, 1, 0x41, 1, 2, 3]);
    assert.equal(annexBHasIdr(idr), true);
    assert.equal(annexBHasIdr(delta), false);
    assert.equal(annexBHasIdr(new Uint8Array([1, 2, 3])), false);
  });
});

describe("resize clamp", () => {
  it("clamps to the guest-accepted range", () => {
    assert.deepEqual(clampResizeSize(1920.7, 1080.2), { width: 1920, height: 1080 });
    assert.deepEqual(clampResizeSize(100, 100), { width: 320, height: 200 });
    assert.deepEqual(clampResizeSize(20000, 20000), { width: 8192, height: 8192 });
  });
});

describe("resize snap to advertised modes", () => {
  const modes = [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
  ];
  it("picks the closest mode, including one slightly larger than the viewport", () => {
    assert.deepEqual(snapResizeSize(2000, 1200, modes), { width: 1920, height: 1080 });
    assert.deepEqual(snapResizeSize(1920, 1080, modes), { width: 1920, height: 1080 });
    assert.deepEqual(snapResizeSize(1920, 980, modes), { width: 1920, height: 1080 });
    assert.deepEqual(snapResizeSize(3840, 2010, modes), { width: 3840, height: 2160 });
  });
  it("falls back to the smallest mode when nothing fits", () => {
    assert.deepEqual(snapResizeSize(800, 600, modes), { width: 1280, height: 720 });
  });
  it("returns null without advertised modes", () => {
    assert.equal(snapResizeSize(1920, 1080, []), null);
    assert.equal(snapResizeSize(1920, 1080, [{ width: 0, height: 0 }]), null);
  });
});

describe("fixed-resolution choices and guest resize budget", () => {
  it("offers additional presets without advertising them as driver-supported", () => {
    const choices = resolutionChoices([{ width: 1280, height: 720 }, { width: 1280, height: 720 }, { width: 1440, height: 810 }, { width: -1, height: 0 }]);
    assert.equal(choices.filter((m) => m.width === 1280 && m.height === 720).length, 1);
    assert.equal(choices.find((m) => m.width === 1280 && m.height === 720).advertised, true);
    assert.equal(choices.find((m) => m.width === 1440 && m.height === 810).advertised, true);
    for (const [width, height] of [[1600, 900], [1920, 1200], [2560, 1440], [3440, 1440], [3840, 2160]]) {
      assert.equal(choices.find((m) => m.width === width && m.height === height).advertised, false);
    }
    assert.ok(choices.every((m) => m.width >= 320 && m.height >= 200));
  });
  it("covers the guest's maximum 30s resize + 8s grace + 2s reply wait", () => {
    assert.ok(RESIZE_CONFIRMATION_TIMEOUT_MS > 40_000);
  });
});

describe("opus identification header", () => {
  it("builds a 19-byte OpusHead for 48kHz stereo", () => {
    const head = opusHead();
    assert.equal(head.length, 19);
    assert.equal(new TextDecoder().decode(head.slice(0, 8)), "OpusHead");
    assert.equal(head[8], 1);
    assert.equal(head[9], 2);
  });
});

describe("audio playout scheduling", () => {
  it("advances the cursor by buffer duration with a lead-in", () => {
    const first = playoutNext(10, 0, 0.02);
    assert.equal(first.startAt, 10.05);
    assert.equal(first.cursor, 10.07);
    const second = playoutNext(10.01, first.cursor, 0.02);
    assert.equal(second.startAt, 10.07);
  });
  it("resyncs stale backlog instead of playing late", () => {
    const r = playoutNext(10, 11, 0.02);
    assert.equal(r.startAt, 10.05);
  });
});

describe("desktop handoff policy", () => {
  const payload = (reason) => ({ session: { desktop: { requiresConsole: true, reason } } });
  it("yields at once for the secure desktop", () => {
    assert.deepEqual(desktopRequiresConsole(payload("protected-desktop"), 0), {
      required: true,
      reason: "protected-desktop",
    });
  });
  it("debounces a higher-integrity window", () => {
    assert.equal(desktopRequiresConsole(payload("higher-integrity-window"), 1).required, false);
    assert.equal(desktopRequiresConsole(payload("higher-integrity-window"), 2).required, true);
  });
  it("ignores malformed telemetry", () => {
    assert.equal(desktopRequiresConsole(null, 5).required, false);
    assert.equal(desktopRequiresConsole({}, 5).required, false);
  });
});

describe("keysym mapping", () => {
  it("maps named and printable keys, rejects the rest", () => {
    assert.equal(keyToKeysym("Enter"), 0xff0d);
    assert.equal(keyToKeysym("ArrowLeft"), 0xff51);
    assert.equal(keyToKeysym("a"), 0x61);
    assert.equal(keyToKeysym("F1"), 0xffbe);
    assert.equal(keyToKeysym("F12"), 0xffc9);
    assert.equal(keyToKeysym("Unidentified"), null);
  });
});
