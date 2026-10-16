import type { DisplayMode } from "./agent-protocol";

export interface ResolutionState {
  actual: DisplayMode | null;
  pending: { id: string; requested: DisplayMode; acknowledged?: DisplayMode; note?: string } | null;
  note: string | null;
}

export const initialResolution: ResolutionState = { actual: null, pending: null, note: null };
export type ResolutionEvent =
  | { type: "reset" }
  | { type: "policy" }
  | { type: "request"; id: string; size: DisplayMode }
  | { type: "ack"; id: string; actual: unknown; reason: unknown }
  | { type: "frame"; size: DisplayMode }
  | { type: "timeout"; id: string };

export function sameMode(a: DisplayMode | null | undefined, b: DisplayMode | null | undefined): boolean {
  return !!a && !!b && a.width === b.width && a.height === b.height;
}

export function parseGuestMode(value: unknown): DisplayMode | null {
  if (!value || typeof value !== "object") return null;
  const { width, height } = value as DisplayMode;
  return Number.isInteger(width) && Number.isInteger(height) && width >= 320 && height >= 200 && width <= 8192 && height <= 8192 ? { width, height } : null;
}

const dimensions = (size: DisplayMode) => `${size.width}×${size.height}`;

// Windows software H.264 encodes macroblock-padded frames (e.g. 1920x1088
// for a 1920x1080 desktop). Only crop against matching guest OS readback;
// a newly-sized IDR can precede its ACK, so stale dimensions must not crop it.
export function guestFrameSize(frame: DisplayMode, readback: DisplayMode | null): DisplayMode {
  if (readback && parseGuestMode(readback)
    && (frame.width === readback.width || frame.width === Math.ceil(readback.width / 16) * 16)
    && (frame.height === readback.height || frame.height === Math.ceil(readback.height / 16) * 16)) return { ...readback };
  return frame;
}

// Requested dimensions never replace actual output. ACK and frame can arrive
// in either order; stale ACKs/timeouts cannot complete a newer request.
export function resolutionReducer(state: ResolutionState, event: ResolutionEvent): ResolutionState {
  switch (event.type) {
    case "reset": return initialResolution;
    case "policy": return { ...state, pending: null, note: null };
    case "request": return { ...state, pending: { id: event.id, requested: event.size }, note: `Requesting ${dimensions(event.size)}…` };
    case "frame": {
      if (!parseGuestMode(event.size)) return state;
      const size = guestFrameSize(event.size, state.pending?.acknowledged ?? null);
      if (sameMode(state.pending?.acknowledged, size)) return { actual: size, pending: null, note: state.pending?.note ?? null };
      return sameMode(state.actual, size) ? state : { ...state, actual: size };
    }
    case "ack": {
      if (!state.pending || state.pending.id !== event.id) return state;
      const actual = parseGuestMode(event.actual);
      const reason = typeof event.reason === "string" ? event.reason : "";
      if (!actual) return { ...state, pending: null, note: `Resize not applied${reason ? ` (${reason})` : " (no guest readback)"}` };
      const note = !sameMode(actual, state.pending.requested)
        ? `Requested ${dimensions(state.pending.requested)}; guest reports ${dimensions(actual)}${reason ? ` (${reason})` : ""}`
        : reason ? `Guest reports ${dimensions(actual)} (${reason})` : null;
      if (state.actual && sameMode(actual, guestFrameSize(state.actual, actual))) return { actual, pending: null, note };
      return { ...state, pending: { ...state.pending, acknowledged: actual, note: note ?? undefined }, note: `${note ?? `Guest reports ${dimensions(actual)}`} — waiting for video…` };
    }
    case "timeout": return state.pending?.id === event.id
      ? { ...state, pending: null, note: "Resize confirmation timed out; showing the last delivered guest mode" } : state;
  }
}
