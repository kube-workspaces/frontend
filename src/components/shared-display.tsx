"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import {
  API_BASE,
  joinDisplay,
  leaveDisplay,
  acquireDisplayControl,
  releaseDisplayControl,
  getDisplayStatus,
  type DisplayStatus,
} from "@/lib/api";

interface SharedDisplayProps {
  workspaceName: string;
  namespace: string;
  onConnectionChange?: (connected: boolean) => void;
}

interface StreamIntent {
  role: "observer" | "controller";
  force: boolean;
}

// A noVNC RFB view over the API's shared-display WebSocket
// (/v1/workspaces/{name}/display/ws). One controller streams RFB input through
// a server-side fence; every other participant is a view-only observer.
// Membership is created via POST /display/join, and control is switched with
// the REST acquire/release endpoints, which demote/release the registry role
// server-enforced. Promotions and demotions applied remotely (takeover or
// transfer) are detected by polling status and the stream re-attaches with the
// right role.
export default function SharedDisplay({
  workspaceName,
  namespace,
  onConnectionChange,
}: SharedDisplayProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const participantIdRef = useRef<string | null>(null);
  const joinedRef = useRef(false);
  const disposed = useRef(false);
  const everConnected = useRef(false);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempt = useRef(0);
  const mountStreamRef = useRef<() => void>(() => {});
  const manualClose = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const disconnectTimer = useRef<number | null>(null);
  const intentRef = useRef<StreamIntent>({ role: "observer", force: false });
  const pointerHandlerRef = useRef<((e: PointerEvent) => void) | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DisplayStatus | null>(null);
  const [role, setRole] = useState<"observer" | "controller">("observer");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [takeoverPrompt, setTakeoverPrompt] = useState(false);
  const [controllerName, setControllerName] = useState<string | null>(null);

  const notify = useCallback(
    (connected: boolean) => {
      setIsConnected(connected);
      if (onConnectionChange) onConnectionChange(connected);
    },
    [onConnectionChange]
  );

  const applyViewOnly = useCallback((rfb: RFB) => {
    const managing = intentRef.current;
    rfb.viewOnly = managing.role !== "controller";
    // Observers must not mutate the guest: no desktop resize, no input. Scaling
    // the client-side canvas is fine and stays enabled.
    rfb.resizeSession = managing.role === "controller";
    rfb.scaleViewport = true;
    rfb.clipViewport = false;
  }, []);

  const mountStream = useCallback(() => {
    if (disposed.current || !mountRef.current || !participantIdRef.current) return;
    if (mountRef.current.clientWidth === 0 || mountRef.current.clientHeight === 0) {
      requestAnimationFrame(() => mountStreamRef.current());
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const intent = intentRef.current;
    const wsUrl =
      `${protocol}//${host}${API_BASE}/v1/workspaces/${workspaceName}/display/ws` +
      `?namespace=${encodeURIComponent(namespace)}` +
      `&role=${intent.role}` +
      `&participant=${encodeURIComponent(participantIdRef.current)}` +
      (intent.force ? "&force=1" : "");

    const rfb = new RFB(mountRef.current, wsUrl, {
      wsProtocols: ["binary", "plain.kubevirt.io"],
    });
    applyViewOnly(rfb);
    rfbRef.current = rfb;

    rfb.addEventListener("connect", () => {
      setError(null);
      reconnectAttempt.current = 0;
      everConnected.current = true;
      notify(true);
      rfb.focus();
    });

    const container = mountRef.current;
    const handlePointerEvent = (e: PointerEvent) => {
      const rfb = rfbRef.current;
      if (!rfb || rfb.viewOnly || !mountRef.current) return;
      // Map through the rendered canvas so coordinates stay correct with
      // scaleViewport letterboxing and any guest resolution changes.
      const canvas = mountRef.current.querySelector("canvas");
      if (!canvas) return;
      const fbW = canvas.width > 0 ? canvas.width : 1920;
      const fbH = canvas.height > 0 ? canvas.height : 1080;
      const box = canvas.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;

      const x = Math.max(0, Math.min(fbW, Math.floor(((e.clientX - box.left) / box.width) * fbW)));
      const y = Math.max(0, Math.min(fbH, Math.floor(((e.clientY - box.top) / box.height) * fbH)));

      let buttonMask = 0;
      if (e.buttons & 1) buttonMask |= 1;
      if (e.buttons & 2) buttonMask |= 2;
      if (e.buttons & 4) buttonMask |= 4;
      if (e.type === "pointerdown" || e.type === "pointerup") {
        if (e.button === 0) {
          if (e.type === "pointerdown") buttonMask |= 1;
          else buttonMask &= ~1;
        }
      }
      try {
        rfb.sendPointerEvent(x, y, buttonMask);
      } catch {
        // ignore
      }
    };
    pointerHandlerRef.current = handlePointerEvent;
    container.addEventListener("pointermove", handlePointerEvent);
    container.addEventListener("pointerdown", handlePointerEvent);
    container.addEventListener("pointerup", handlePointerEvent);

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = window.setTimeout(() => {
          const rfb = rfbRef.current;
          if (!rfb || disposed.current) return;
          const el = mountRef.current;
          if (!el || el.clientWidth <= 0 || el.clientHeight <= 0) return;
          try {
            rfb.scaleViewport = rfb.scaleViewport;
            rfb.resizeSession = rfb.resizeSession;
          } catch {
            // scaling/guest-resize best-effort
          }
        }, 150);
      });
      ro.observe(container);
      resizeObserverRef.current = ro;
    }

    rfb.addEventListener("disconnect", (e: Event) => {
      const detail = (e as CustomEvent<{ clean?: boolean; reason?: string }>).detail;
      const reason = detail?.reason || "";
      notify(false);
      if (disposed.current || manualClose.current) {
        manualClose.current = false;
        return;
      }
      setError(detail?.clean === false ? `Display disconnected: ${reason}`.trim() : "Display disconnected");
      if (everConnected.current) {
        const attempt = reconnectAttempt.current + 1;
        reconnectAttempt.current = attempt;
        const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15000);
        if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = window.setTimeout(() => mountStreamRef.current(), delay);
      }
    });
    rfb.addEventListener("disconnect", () => {
      if (pointerHandlerRef.current && container) {
        container.removeEventListener("pointermove", pointerHandlerRef.current);
        container.removeEventListener("pointerdown", pointerHandlerRef.current);
        container.removeEventListener("pointerup", pointerHandlerRef.current);
        pointerHandlerRef.current = null;
      }
    });
    rfb.addEventListener("securityfailure", (e: Event) => {
      const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason;
      setError(`Security failure: ${reason || "unknown"}`);
      notify(false);
    });
    rfb.addEventListener("desktopname", () => {
      setError(null);
    });
  }, [workspaceName, namespace, notify, applyViewOnly]);

  useEffect(() => {
    mountStreamRef.current = mountStream;
  }, [mountStream]);

  // Re-attach with a new role: disconnect any live stream (suppressing the
  // auto-reconnect of the old intent), then open the new one.
  const reattachWithRole = useCallback((intent: StreamIntent) => {
    intentRef.current = intent;
    setRole(intent.role);
    manualClose.current = true;
    const rfb = rfbRef.current;
    rfbRef.current = null;
    if (rfb) {
      try {
        rfb.disconnect();
      } catch {
        // ignore
      }
    }
    if (disconnectTimer.current) window.clearTimeout(disconnectTimer.current);
    // Delay so the old connection fully unwinds before the new dial.
    disconnectTimer.current = window.setTimeout(() => mountStreamRef.current(), 50);
  }, []);

  const requestControl = useCallback(
    async (force: boolean) => {
      const id = participantIdRef.current;
      if (!id || controlBusy) return;
      setTakeoverPrompt(false);
      setControlBusy(true);
      try {
        await acquireDisplayControl(workspaceName, namespace, id, force);
        reattachWithRole({ role: "controller", force });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to take control");
      } finally {
        setControlBusy(false);
      }
    },
    [workspaceName, namespace, controlBusy, reattachWithRole]
  );

  const releaseControl = useCallback(async () => {
    const id = participantIdRef.current;
    if (!id || controlBusy) return;
    setControlBusy(true);
    try {
      await releaseDisplayControl(workspaceName, namespace, id);
      reattachWithRole({ role: "observer", force: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release control");
    } finally {
      setControlBusy(false);
    }
  }, [workspaceName, namespace, controlBusy, reattachWithRole]);

  // Poll membership: drive the role badge/participant list and react to remote
  // role changes (takeover demotes us; a transfer promotes an observer).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const st = await getDisplayStatus(workspaceName, namespace);
        if (cancelled) return;
        setStatus(st);
        setControllerName(st.controller ? st.controller.id : null);
        const id = participantIdRef.current;
        if (!id) return;
        const me = st.observers.find((o) => o.id === id) || st.controller;
        if (!me) return;
        const intent = intentRef.current;
        if (me.role !== intent.role) {
          // Promoted (transfer) or demoted (takeover) remotely: re-attach with
          // the authoritative role. No REST transition needed — the registry
          // already changed.
          reattachWithRole({ role: me.role === "controller" ? "controller" : "observer", force: false });
        }
      } catch {
        // transient poll failure: keep last known state
      }
    };
    poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workspaceName, namespace, reattachWithRole]);

  // Join the session once, then attach the observer stream.
  useEffect(() => {
    disposed.current = false;
    let cancelled = false;
    const start = async () => {
      if (cancelled) return;
      if (joinedRef.current) return;
      try {
        const result = await joinDisplay(workspaceName, namespace, "observer");
        if (cancelled) return;
        joinedRef.current = true;
        participantIdRef.current = result.participant.id;
        setParticipantId(result.participant.id);
        intentRef.current = { role: "observer", force: false };
        setRole("observer");
        mountStreamRef.current();
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to join the shared display session"
        );
      }
    };
    start().catch(console.error);
    const container = mountRef.current;
    return () => {
      cancelled = true;
      disposed.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (disconnectTimer.current) window.clearTimeout(disconnectTimer.current);
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (container && pointerHandlerRef.current) {
        container.removeEventListener("pointermove", pointerHandlerRef.current);
        container.removeEventListener("pointerdown", pointerHandlerRef.current);
        container.removeEventListener("pointerup", pointerHandlerRef.current);
        pointerHandlerRef.current = null;
      }
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
      const id = participantIdRef.current;
      if (id) {
        leaveDisplay(workspaceName, namespace, id).catch(() => {
          // membership is also dropped server-side via TTL/idle expiry
        });
      }
      participantIdRef.current = null;
      setParticipantId(null);
      joinedRef.current = false;
      notify(false);
    };
  }, [workspaceName, namespace, notify]);

  const amController = role === "controller";
  const otherController =
    controllerName !== null && controllerName !== participantId;

  return (
    <div className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden">
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ position: "relative", width: "100%", height: "100%", touchAction: "none" }}
      />
      <div className="absolute top-2 right-3 flex flex-col items-end gap-2 z-10">
        <div className="flex items-center gap-2 bg-black/50 rounded px-2 py-1 backdrop-blur">
          <span
            className={`px-2 py-0.5 text-xs rounded font-medium ${
              amController
                ? "bg-green-700/80 text-green-100"
                : "bg-gray-800/80 text-gray-300"
            }`}
          >
            {amController ? "Controller" : "Observer"}
          </span>
          <span className="text-xs text-gray-300">
            {status ? `${status.participants} viewer${status.participants === 1 ? "" : "s"}` : "…"}
          </span>
          <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
        </div>
        {amController ? (
          <button
            onClick={releaseControl}
            disabled={!isConnected || controlBusy}
            className="px-3 py-1 text-xs bg-rose-700 hover:bg-rose-600 text-white rounded transition-colors disabled:opacity-50"
          >
            {controlBusy ? "Releasing…" : "Release control"}
          </button>
        ) : (
          <button
            onClick={() => {
              if (otherController) setTakeoverPrompt(true);
              else requestControl(false);
            }}
            disabled={!isConnected || controlBusy}
            className="px-3 py-1 text-xs bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors disabled:opacity-50"
          >
            {controlBusy ? "Requesting…" : "Request control"}
          </button>
        )}
      </div>

      {error && !isConnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#1a1b26]">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              mountStreamRef.current();
            }}
            className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors"
          >
            Reconnect
          </button>
        </div>
      )}

      {takeoverPrompt && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
          <div className="text-center max-w-md p-6">
            <p className="text-yellow-400 mb-4 text-sm">
              Another viewer currently controls this display. Take over? The
              current controller is demoted to a view-only observer.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => requestControl(true)}
                disabled={controlBusy}
                className={`px-4 py-2 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors ${
                  controlBusy ? "opacity-75 cursor-not-allowed" : ""
                }`}
              >
                {controlBusy ? "Taking over…" : "Take over"}
              </button>
              <button
                onClick={() => setTakeoverPrompt(false)}
                disabled={controlBusy}
                className="px-4 py-2 text-sm bg-[var(--color-secondary)] hover:bg-[var(--color-secondary-hover)] text-[var(--color-secondary-foreground)] rounded transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}