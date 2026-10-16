import type { DisplayMode } from "./agent-protocol";

export interface ResolutionState {
  actual: DisplayMode | null;
  pending: { id: string; requested: DisplayMode; acknowledged?: DisplayMode; note?: string } | null;
  note: string | null;
}

export const initialResolution: ResolutionState = { actual: null, pending: null, note: null };
export type ResolutionEvent =
  | { type: "reset" }
  | { type: "request"; id: string; size: DisplayMode }
  | { type: "ack"; id: string; actual: unknown; reason: unknown }
  | { type: "frame"; size: DisplayMode }
  | { type: "timeout"; id: string };

export function sameMode(a: DisplayMode | null | undefined, b: DisplayMode | null | undefined): boolean {
  return !!a && !!b && a.width === b.width && a.height === b.height;
}

function mode(value: unknown): DisplayMode | null {
  if (!value || typeof value !== "object") return null;
  const { width, height } = value as DisplayMode;
  return Number.isInteger(width) && Number.isInteger(height) && width >= 320 && height >= 200 && width <= 8192 && height <= 8192 ? { width, height } : null;
}

const dimensions = (size: DisplayMode) => `${size.width}×${size.height}`;

// Requested dimensions never replace actual output. ACK and frame can arrive
// in either order; stale ACKs/timeouts cannot complete a newer request.
export function resolutionReducer(state: ResolutionState, event: ResolutionEvent): ResolutionState {
  switch (event.type) {
    case "reset": return initialResolution;
    case "request": return { ...state, pending: { id: event.id, requested: event.size }, note: `Requesting ${dimensions(event.size)}…` };
    case "frame": {
      if (!mode(event.size)) return state;
      if (sameMode(state.pending?.acknowledged, event.size)) return { actual: event.size, pending: null, note: state.pending?.note ?? null };
      return sameMode(state.actual, event.size) ? state : { ...state, actual: event.size };
    }
    case "ack": {
      if (!state.pending || state.pending.id !== event.id) return state;
      const actual = mode(event.actual);
      const reason = typeof event.reason === "string" ? event.reason : "";
      if (!actual) return { ...state, pending: null, note: `Resize not applied${reason ? ` (${reason})` : " (no guest readback)"}` };
      const note = !sameMode(actual, state.pending.requested)
        ? `Requested ${dimensions(state.pending.requested)}; guest reports ${dimensions(actual)}${reason ? ` (${reason})` : ""}`
        : reason ? `Guest reports ${dimensions(actual)} (${reason})` : null;
      if (sameMode(actual, state.actual)) return { ...state, pending: null, note };
      return { ...state, pending: { ...state.pending, acknowledged: actual, note: note ?? undefined }, note: `${note ?? `Guest reports ${dimensions(actual)}`} — waiting for video…` };
    }
    case "timeout": return state.pending?.id === event.id
      ? { ...state, pending: null, note: "Resize confirmation timed out; showing the last delivered guest mode" } : state;
  }
}
