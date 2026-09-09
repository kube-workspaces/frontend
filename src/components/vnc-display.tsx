"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import { API_BASE } from "@/lib/api";

interface VncDisplayProps {
  workspaceName: string;
  namespace: string;
  onConnectionChange?: (connected: boolean) => void;
}

// A noVNC RFB view over the API's /v1/workspaces/{name}/vnc WebSocket bridge.
// The bridge speaks the raw RFB byte stream, so the browser client connects
// directly — no websockify hop required. The VMI VNC console is single-session;
// the API refuses a second bridge with 409 while another session holds it.
export default function VncDisplay({
  workspaceName,
  namespace,
  onConnectionChange,
}: VncDisplayProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempt = useRef(0);
  const everConnected = useRef(false);
  const disposed = useRef(false);
  const mountRFBRef = useRef<() => void>(() => {});
  const pointerDownHandlerRef = useRef<(() => void) | null>(null);

  const notify = useCallback(
    (connected: boolean) => {
      setIsConnected(connected);
      if (onConnectionChange) onConnectionChange(connected);
    },
    [onConnectionChange]
  );

  const mountRFB = useCallback(() => {
    if (disposed.current || !mountRef.current) return;

    if (mountRef.current.clientWidth === 0 || mountRef.current.clientHeight === 0) {
      requestAnimationFrame(() => mountRFBRef.current());
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}${API_BASE}/v1/workspaces/${workspaceName}/vnc?namespace=${namespace}`;

    const rfb = new RFB(mountRef.current, wsUrl, {
      // Prefer a raw-binary subprotocol; the API bridge echoes whichever the
      // client offers (binary / base64 / plain.kubevirt.io).
      wsProtocols: ["binary", "plain.kubevirt.io"],
      scaleViewport: false,
      resizeSession: false,
      clipViewport: false,
      viewOnly: false,
    });
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
      if (!rfbRef.current || !mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const fbW = 1920;
      const fbH = 1080;

      const x = Math.max(0, Math.min(fbW, Math.floor((clientX / rect.width) * fbW)));
      const y = Math.max(0, Math.min(fbH, Math.floor((clientY / rect.height) * fbH)));

      let buttonMask = 0;
      if (e.buttons & 1) buttonMask |= 1;
      if (e.buttons & 2) buttonMask |= 2;
      if (e.buttons & 4) buttonMask |= 4;
      // also consider e.button if pointerdown/up
      if (e.type === "pointerdown" || e.type === "pointerup") {
        if (e.button === 0) {
          if (e.type === "pointerdown") buttonMask |= 1;
          else buttonMask &= ~1;
        }
      }

      try {
        if (rfbRef.current && typeof rfbRef.current.sendPointerEvent === "function") {
          rfbRef.current.sendPointerEvent(x, y, buttonMask);
        }
      } catch (err) {
        // ignore
      }
    };

    pointerDownHandlerRef.current = handlePointerEvent as unknown as () => void;
    if (container) {
      container.addEventListener("pointermove", handlePointerEvent);
      container.addEventListener("pointerdown", handlePointerEvent);
      container.addEventListener("pointerup", handlePointerEvent);
    }
    rfb.addEventListener("disconnect", (e: Event) => {
      const detail = (e as CustomEvent<{ clean?: boolean; reason?: string }>).detail;
      const reason = detail?.reason || "";
      setError(
        detail?.clean === false
          ? `Display disconnected: ${reason}`.trim() || "Display disconnected"
          : reason
          ? `Display closed: ${reason}`
          : "Display disconnected"
      );
      notify(false);
      if (disposed.current) return;
      // Only auto-reconnect sessions that actually established once. A connect
      // that never opened (e.g. another session holds the display, the VM is
      // stopped) shows the error state instead of churning.
      if (everConnected.current) {
        const attempt = reconnectAttempt.current + 1;
        reconnectAttempt.current = attempt;
        const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15000);
        if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = window.setTimeout(() => mountRFBRef.current(), delay);
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
  }, [workspaceName, namespace, notify]);

  useEffect(() => {
    mountRFBRef.current = mountRFB;
  }, [mountRFB]);

  useEffect(() => {
    disposed.current = false;
    mountRFB();
    const container = mountRef.current;
    return () => {
      disposed.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (container && pointerDownHandlerRef.current) {
        container.removeEventListener("pointermove", pointerDownHandlerRef.current);
        container.removeEventListener("pointerdown", pointerDownHandlerRef.current);
        container.removeEventListener("pointerup", pointerDownHandlerRef.current);
      }
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
      notify(false);
    };
  }, [mountRFB, notify]);

  if (error && !isConnected) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#1a1b26]">
        <p className="text-red-400 text-sm">{error}</p>
        <span className="text-xs text-gray-500">
          Another session may hold the display (KubeVirt VNC is single-session).
        </span>
        <button
          onClick={() => {
            setError(null);
            mountRFB();
          }}
          className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors"
        >
          Reconnect
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-black flex items-center justify-center">
      <div
        ref={mountRef}
        style={{ position: "relative", width: "100%", height: "100%", touchAction: "none" }}
      />
      <div className="absolute top-2 right-3 flex items-center gap-2 z-10">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"
          }`}
        />
        <span className={`text-xs ${isConnected ? "text-gray-400" : "text-gray-600"}`}>
          {isConnected ? "Display connected" : "Connecting…"}
        </span>
      </div>
    </div>
  );
}