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
// directly — no websockify hop required.
export default function VncDisplay({
  workspaceName,
  namespace,
  onConnectionChange,
}: VncDisplayProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notify = useCallback(
    (connected: boolean) => {
      setIsConnected(connected);
      if (onConnectionChange) onConnectionChange(connected);
    },
    [onConnectionChange]
  );

  useEffect(() => {
    if (!mountRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}${API_BASE}/v1/workspaces/${workspaceName}/vnc?namespace=${namespace}`;

    const rfb = new RFB(mountRef.current, wsUrl, {
      // Prefer a raw-binary subprotocol; the API bridge echoes whichever the
      // client offers (binary / base64 / plain.kubevirt.io).
      wsProtocols: ["binary", "plain.kubevirt.io"],
      scaleViewport: true,
      resizeSession: false,
      clipViewport: false,
      viewOnly: false,
    });
    rfbRef.current = rfb;

    rfb.addEventListener("connect", () => {
      setError(null);
      notify(true);
    });
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
    });
    rfb.addEventListener("securityfailure", (e: Event) => {
      const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason;
      setError(`Security failure: ${reason || "unknown"}`);
      notify(false);
    });
    rfb.addEventListener("desktopname", () => {
      setError(null);
    });

    return () => {
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
      notify(false);
    };
  }, [workspaceName, namespace, notify]);

  if (error && !isConnected) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#1a1b26]">
        <p className="text-red-400 text-sm">{error}</p>
        <span className="text-xs text-gray-500">
          Another session may hold the display (KubeVirt VNC is single-session).
        </span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ touchAction: "none" }}
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