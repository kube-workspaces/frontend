"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import { API_BASE, checkVNCConsoleInUse, takeOverVNCConsole } from "@/lib/api";
import { useAdaptiveQualityController, applyQualitySettings, requestLosslessRefresh } from "@/lib/adaptive-quality-controller";

// AQC debug flag (can be toggled via environment or settings)
const AQC_DEBUG = process.env.NEXT_PUBLIC_AQC_DEBUG === "true";

interface VncDisplayProps {
  workspaceName: string;
  namespace: string;
  onConnectionChange?: (connected: boolean) => void;
}

// AQC state tracking for quality adaptation
interface AqcContext {
  metrics: any;
  motionState: any;
  networkTierIndex: number;
  applyQualitySettings: typeof applyQualitySettings;
  requestLosslessRefresh: typeof requestLosslessRefresh;
  debugInfo: any;
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
  const [takeoverPrompt, setTakeoverPrompt] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempt = useRef(0);
  const everConnected = useRef(false);
  const disposed = useRef(false);
  const mountRFBRef = useRef<() => void>(() => {});
  const pointerDownHandlerRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const takeoverApproved = useRef<boolean>(false);
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);

  // Audio is off by default and only enabled after an explicit user click.
  // QEMU's VNC audio pseudo-encoding (-259) streams raw PCM in the RFB
  // stream; noVNC plays it through WebAudio. The click matters twice:
  //   - it is the user gesture that unlocks the AudioContext (autoplay
  //     policy), so allow_audio() is called from inside the click;
  //   - it toggles the actual stream capture on the server (enable_audio).
  const toggleSound = useCallback(() => {
    const rfb = rfbRef.current;
    if (!rfb) return;
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    rfb.allow_audio();
    rfb.enable_audio(next);
  }, []);

  const notify = useCallback(
    (connected: boolean) => {
      setIsConnected(connected);
      if (onConnectionChange) onConnectionChange(connected);
    },
    [onConnectionChange]
  );

  // Adaptive Quality Controller integration - Phase 2 feature
  const aqcContextRef = useRef<AqcContext>({
    metrics: null,
    motionState: "Idle",
    networkTierIndex: 2,
    applyQualitySettings,
    requestLosslessRefresh,
    debugInfo: { metricsHistory: [], stateTransitions: [] },
  });

  // Use the adaptive quality controller hook for real-time adaptation
  const aqc = useAdaptiveQualityController();
  const totalBytesRef = useRef(0);

  useEffect(() => {
    const rfb = rfbRef.current;
    if (!rfb || !isConnected) return;

    // Expose RFB and byte counter to AQC
    (window as any).__aqc_rfb = rfb;
    (window as any).__aqc_total_bytes = totalBytesRef.current;

    // Hook the underlying WebSocket for byte counting
    const ws = (rfb as any)._websocket;
    if (ws && ws._websocket && !(ws._websocket as any).__aqc_hooked) {
      const realWs = ws._websocket;
      realWs.__aqc_hooked = true;
      (window as any).__aqc_vnc_ws = realWs;

      const originalOnMessage = realWs.onmessage;
      realWs.onmessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          totalBytesRef.current += event.data.byteLength;
          (window as any).__aqc_total_bytes = totalBytesRef.current;
          
          // Track last message time for RTT/activity
          (window as any).__aqc_last_msg_at = performance.now();
        }
        if (originalOnMessage) originalOnMessage.call(realWs, event);
      };
    }

    if (AQC_DEBUG) {
      console.log("[AQC] Controller Active. Motion:", aqc.motionState, "Tier:", aqc.networkTierIndex);
    }
  }, [isConnected, aqc.motionState, aqc.networkTierIndex]);


  const mountRFB = useCallback(async () => {
    if (disposed.current || !mountRef.current) return;

    // VNC displays are single-session; check for active session before connecting.
    let inUse = false;
    try {
      inUse = await checkVNCConsoleInUse(workspaceName, namespace);
    } catch {
      inUse = false; // fail-open: a status hiccup should not block the display
    }

    if (inUse && !takeoverApproved.current) {
      setTakeoverPrompt(true);
      return;
    }

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
    });
    // noVNC 1.7.0: scaleViewport/resizeSession/clipViewport/viewOnly are NOT
    // constructor options — they are silently ignored there and must be set as
    // properties after construction (this was the root cause of fluid resize
    // never working: resizeSession was never actually enabled).
    //   scaleViewport: scale the framebuffer to fill the container.
    //   resizeSession: ask the backend (QEMU via the VNC SetDesktopSize
    //     extension) to resize the guest display to match the container.
    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.clipViewport = false;
    rfb.viewOnly = false;
    
    // Apply initial quality settings based on network assessment (Phase C)
    const initialTierIndex = aqc.networkTierIndex ?? 2;
    applyQualitySettings(initialTierIndex, 88, 2);

    rfbRef.current = rfb;

    rfb.addEventListener("connect", () => {
      setError(null);
      reconnectAttempt.current = 0;
      everConnected.current = true;
      notify(true);
      rfb.focus();
      // A reconnect creates a fresh RFB instance which starts with audio
      // disabled; re-apply the user's sound preference. allow_audio() resumes
      // the (already created) AudioContext from this connect event.
      if (soundOnRef.current) {
        rfb.allow_audio();
        rfb.enable_audio(true);
      }
    });
    const container = mountRef.current;
    const handlePointerEvent = (e: PointerEvent) => {
      if (!rfbRef.current || !mountRef.current) return;
      // Map through the actual rendered framebuffer canvas so coordinates stay
      // correct no matter how scaleViewport sizes/centres it (letterboxing) and
      // how resizeSession changes the guest resolution. The canvas drawing
      // buffer (width/height) holds the framebuffer pixels; its on-screen box
      // gives the scaled, letterboxed position.
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
      // also consider e.button if pointerdown/up
      if (e.type === "pointerdown" || e.type === "pointerup") {
        if (e.button === 0) {
          if (e.type === "pointerdown") buttonMask |= 1;
          else buttonMask &= ~1;
        }
      }

      try {
        if (rfbRef.current) {
          rfbRef.current.sendPointerEvent(x, y, buttonMask);
        }
      } catch {
        // ignore
      }
    };

    pointerDownHandlerRef.current = handlePointerEvent as unknown as () => void;
    if (container) {
      container.addEventListener("pointermove", handlePointerEvent);
      container.addEventListener("pointerdown", handlePointerEvent);
      container.addEventListener("pointerup", handlePointerEvent);
    }
    // Fluid display: whenever the modal/viewport container changes size, ask
    // the backend (QEMU, via the VNC SetDesktopSize extension over the bridge)
    // to resize the guest display to match, debounced. We use noVNC's PUBLIC
    // setters (not rfb.setDesktopSize, which does not exist on the RFB instance
    // in noVNC 1.7.0):
    //   - re-assigning rfb.resizeSession re-runs noVNC's _requestRemoteResize(),
    //     which sends the SetDesktopSize VNC message (only when the server
    //     negotiated the ExtendedDesktopSize extension);
    //   - re-assigning rfb.scaleViewport re-runs _updateScale(), which
    //     rescales the framebuffer canvas to keep filling the container.
    // scaleViewport/resizeSession are also enabled at construction so the first
    // connect already fills + resizes.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = window.setTimeout(() => {
          const rfb = rfbRef.current;
          if (!rfb || disposed.current) return;
          const el = mountRef.current;
          if (!el || el.clientWidth <= 0 || el.clientHeight <= 0) return;
          try {
            // Force noVNC to recompute the client-side scale from the new
            // container size (always works).
            rfb.scaleViewport = rfb.scaleViewport;
            // Force noVNC to (re)request a guest resolution change to match
            // the container (only takes effect if the server supports it).
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
      setError(
        detail?.clean === false
          ? `Display disconnected: ${reason}`.trim() || "Display disconnected"
          : reason
          ? `Display closed: ${reason}`
          : "Display disconnected"
      );
      notify(false);
      if (disposed.current) return;
      
      // Request lossless refresh before disconnecting to ensure clean shutdown state (Phase D)
      requestLosslessRefresh().catch(console.error);

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

  const handleTakeover = useCallback(async () => {
    setTakeoverBusy(true);
    try {
      if (!takeoverApproved.current) {
        await takeOverVNCConsole(workspaceName, namespace);
        takeoverApproved.current = true;
      }
      setTakeoverPrompt(false);
      mountRFB();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Take over failed");
    } finally {
      setTakeoverBusy(false);
    }
  }, [workspaceName, namespace, mountRFB]);

  const handleTakeoverCancel = useCallback(() => {
    setTakeoverPrompt(false);
    takeoverApproved.current = false;
    setError("VNC display is in use by another session. Reconnect to retry.");
  }, []);

  useEffect(() => {
    disposed.current = false;
    mountRFB().catch(console.error); // Errors in initial mount are not critical
    const container = mountRef.current;
    return () => {
      disposed.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
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
          onClick={async () => {
            try {
              setError(null);
              await mountRFB();
            } catch (err) {
              // If mountRFB shows takeover prompt, that's expected behavior
              console.log("Reconnect error:", err);
            }
          }}
          className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors"
        >
          Reconnect
        </button>
      </div>
    );
  }

  // When takeoverPrompt is true, show consent overlay; otherwise render VNC display.
  if (takeoverPrompt) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]">
        <div className="text-center max-w-md p-6">
          <p className="text-yellow-400 mb-4 text-sm">
            The VNC display is currently in use by another session. This is expected behavior — KubeVirt VNC is single-session, so only one browser can hold the display at a time.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleTakeover}
              disabled={takeoverBusy}
              className={`px-4 py-2 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors ${
                takeoverBusy ? "opacity-75 cursor-not-allowed" : ""
              }`}
            >
              {takeoverBusy ? "Taking over…" : "Take over"}
            </button>
            <button
              onClick={handleTakeoverCancel}
              className="px-4 py-2 text-sm bg-[var(--color-secondary)] hover:bg-[var(--color-secondary-hover)] text-[var(--color-secondary-foreground)] rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden">
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ position: "relative", width: "100%", height: "100%", touchAction: "none" }}
      />
      <div className="absolute top-2 right-3 flex items-center gap-2 z-10">
        <button
          onClick={toggleSound}
          disabled={!isConnected}
          title={soundOn ? "Mute audio (off)" : "Enable audio (on)"}
          className={`px-2.5 py-1 text-xs rounded transition-colors disabled:opacity-40 ${
            soundOn
              ? "bg-green-700/80 text-green-100 hover:bg-green-600/80"
              : "bg-gray-800/80 text-gray-300 hover:bg-gray-700/80"
          }`}
        >
          Sound: {soundOn ? "On" : "Off"}
        </button>
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"
          }`}
        />
        <span className={`text-xs ${isConnected ? "text-gray-400" : "text-gray-600"}`}>
          {isConnected ? "Display connected" : "Connecting…"}
        </span>
        
        {/* AQC Debug Indicator - shows current quality tier */}
        {AQC_DEBUG && isConnected && (
          <div className="ml-2 px-2 py-1 bg-blue-900/70 rounded text-xs text-blue-100">
            Tier: {aqc.networkTierIndex ?? 2}
          </div>
        )}
      </div>
    </div>
  );
}
