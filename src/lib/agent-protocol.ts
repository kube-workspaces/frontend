// Pure helpers for the kw-agent-v1 browser viewer (W1).
// No DOM/WebSocket here so they stay testable under plain node --test.

export const AGENT_PROTOCOL = "kw-agent-v1";
export const AGENT_PROTOCOL_VERSION = 1;

export interface AgentEnvelope {
  protocol: string;
  protocolVersion: number;
  sessionId: string;
  generation: number;
  sequence: number;
  sentAtNs: number;
  channel: "control";
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

// Monotonic clock guard: the guest fences (generation, sentAtNs) strictly
// increasing. Callers must use nextSentAtNs for every outbound envelope.
// Epoch nanoseconds exceed the JS safe-integer range, so single-nanosecond
// steps are not representable; advance in whole-millisecond steps instead.
export function nextSentAtNs(last: number): number {
  const now = Math.floor(Date.now()) * 1_000_000;
  return now > last ? now : last + 1_000_000;
}

export function controlEnvelope(
  sessionId: string,
  sequence: number,
  sentAtNs: number,
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any> = {}
): AgentEnvelope {
  return {
    protocol: AGENT_PROTOCOL,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    sessionId,
    generation: 1,
    sequence,
    sentAtNs,
    channel: "control",
    type,
    payload,
  };
}

// One framed-protocol frame: tag byte + big-endian u32 length + body.
// Tag 0x00 = JSON control envelope; 0x01 = H.264 Annex-B access unit;
// 0x02 = one Opus packet.
export function encodeControlFrame(envelope: AgentEnvelope): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(envelope));
  const out = new Uint8Array(5 + body.length);
  out[0] = 0x00;
  new DataView(out.buffer).setUint32(1, body.length, false);
  out.set(body, 5);
  return out;
}

export interface DecodedFrame {
  tag: number;
  body: Uint8Array;
}

export function decodeFrame(data: Uint8Array): DecodedFrame | null {
  if (data.length < 5) return null;
  const tag = data[0];
  if (tag !== 0x00 && tag !== 0x01 && tag !== 0x02) return null;
  const length = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1, false);
  const cap = tag === 0x00 ? 1024 * 1024 : 8 * 1024 * 1024;
  if (length === 0 || length > cap || data.length - 5 < length) return null;
  return { tag, body: data.slice(5, 5 + length) };
}

export function parseControlBody(body: Uint8Array): { type?: string; sessionId?: string; payload?: Record<string, unknown> } | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(body));
    if (value === null || typeof value !== "object") return null;
    return value;
  } catch {
    return null;
  }
}

// Opus identification header for WebCodecs. The guest ships raw Opus
// packets (no container); WebCodecs requires the OpusHead description to
// configure the decoder. 48kHz stereo with the standard 312-sample
// preskip; a wrong preskip would only trim milliseconds, but a missing
// header leaves the decoder silent.
export function opusHead(): Uint8Array {
  return new Uint8Array([
    0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, // "OpusHead"
    0x01, // version
    0x02, // channels
    0x38, 0x01, // preskip (312)
    0x80, 0xbb, 0x00, 0x00, // input sample rate (48000)
    0x00, 0x00, // output gain
    0x00, // channel mapping (mono/stereo, no table)
  ]);
}
// Annex-B IDR detection: the guest never labels key vs delta frames, so the
// viewer derives the VideoDecoder chunk type from the NAL stream. NAL type 5
// (IDR slice) marks a key frame; types 1 (non-IDR) alone mark delta.
export function annexBHasIdr(unit: Uint8Array): boolean {
  let zeros = 0;
  for (let i = 0; i < unit.length; i++) {
    const byte = unit[i];
    if (byte === 0) {
      zeros++;
      continue;
    }
    if (byte === 1 && zeros >= 2) {
      const header = unit[i + 1];
      if (header !== undefined && (header & 0x1f) === 5) return true;
      zeros = 0;
      continue;
    }
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return false;
}

// Snap a requested size to the guest's advertised OS mode list. The guest
// tests the exact size (CDS_TEST) and rejects anything outside its discrete
// modes, so viewers must prefer advertised modes over guessing. Policy:
// largest mode that fits inside the request (never exceed the viewport);
// when the request is smaller than every mode, the smallest mode (the
// guest clamps down rather than failing up). Empty/unknown modes → null
// and the caller falls back to sending the clamped size as-is.
export interface DisplayMode {
  width: number;
  height: number;
}

export function snapResizeSize(width: number, height: number, modes: DisplayMode[]): DisplayMode | null {
  const sane = modes.filter((m) =>
    Number.isInteger(m.width) && Number.isInteger(m.height) && m.width >= 320 && m.height >= 200);
  if (sane.length === 0) return null;
  const fitting = sane.filter((m) => m.width <= width && m.height <= height);
  const pool = fitting.length > 0 ? fitting : sane;
  let best = pool[0];
  if (fitting.length > 0) {
    for (const m of pool) {
      if (m.width * m.height > best.width * best.height) best = m;
    }
  } else {
    for (const m of pool) {
      if (m.width * m.height < best.width * best.height) best = m;
    }
  }
  return { width: best.width, height: best.height };
}

// Browser resize uses content CSS pixels against the actual guest output.
// Coalesced upstream (500ms), newest wins; clamp to the guest's accepted
// range so invalid requests never reach the backend. Prefer
// snapResizeSize against hello.displayModes whenever the guest advertises
// modes — the guest exact-tests sizes and rejects off-list requests.
export function clampResizeSize(width: number, height: number): { width: number; height: number } {
  const w = Math.floor(width);
  const h = Math.floor(height);
  return {
    width: Math.max(320, Math.min(8192, w)),
    height: Math.max(200, Math.min(8192, h)),
  };
}

export interface DesktopRequirement {
  required: boolean;
  reason: string;
}

// Mirrors the native consoleHandoff policy: the secure desktop yields at once
// (neither capturable nor injectable); a higher-integrity foreground window
// yields only after it persists, so a flashing elevated window does not bounce
// the user to the console and straight back. Returns true when the premium
// session must yield now; the caller counts consecutive higher-integrity
// readings (2 ≈ two seconds at the 1s telemetry cadence).
export function desktopRequiresConsole(payload: unknown, higherIntegrityTicks: number): DesktopRequirement {
  if (payload === null || typeof payload !== "object") return { required: false, reason: "" };
  const session = (payload as { session?: unknown }).session;
  if (session === null || typeof session !== "object") return { required: false, reason: "" };
  const desktop = (session as { desktop?: unknown }).desktop;
  if (desktop === null || typeof desktop !== "object") return { required: false, reason: "" };
  const record = desktop as { requiresConsole?: unknown; reason?: unknown };
  if (record.requiresConsole !== true) return { required: false, reason: "" };
  const reason = typeof record.reason === "string" ? record.reason : "";
  if (reason === "protected-desktop") return { required: true, reason };
  if (reason === "higher-integrity-window" && higherIntegrityTicks >= 2) {
    return { required: true, reason };
  }
  return { required: false, reason };
}

// Minimal key → X11 keysym mapping for the browser viewer. Printable
// characters map to Unicode keysyms (0x01000000 | code point); a small set of
// named keys maps to their X11 function codes. Returns null when the key has
// no guest meaning (modifiers are tracked by the caller via e.key).
export function keyToKeysym(key: string): number | null {
  switch (key) {
    case "Enter": return 0xff0d;
    case "Backspace": return 0xff08;
    case "Tab": return 0xff09;
    case "Escape": return 0xff1b;
    case "Delete": return 0xffff;
    case "Home": return 0xff50;
    case "End": return 0xff57;
    case "PageUp": return 0xff55;
    case "PageDown": return 0xff56;
    case "ArrowLeft": return 0xff51;
    case "ArrowUp": return 0xff52;
    case "ArrowRight": return 0xff53;
    case "ArrowDown": return 0xff54;
    case "Shift": return 0xffe1;
    case "Control": return 0xffe3;
    case "Alt": return 0xffe9;
    case "Meta": return 0xffeb;
    case " ": return 0x20;
    default: break;
  }
  if (key.length === 1) {
    const cp = key.codePointAt(0);
    if (cp === undefined) return null;
    if (cp <= 0x10ffff && (cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff))) {
      return cp <= 0xff ? cp : 0x01000000 | cp;
    }
  }
  if (/^F([1-9]|1[0-2])$/.test(key)) {
    return 0xffbe + (parseInt(key.slice(1), 10) - 1);
  }
  return null;
}
