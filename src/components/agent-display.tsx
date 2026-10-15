"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, checkTier1InUse, takeOverTier1 } from "@/lib/api";
import {
  annexBHasIdr,
  clampResizeSize,
  controlEnvelope,
  decodeFrame,
  desktopRequiresConsole,
  encodeControlFrame,
  keyToKeysym,
  nextSentAtNs,
  parseControlBody,
} from "@/lib/agent-protocol";

interface AgentDisplayProps {
  workspaceName: string;
  namespace: string;
  onConnectionChange?: (connected: boolean) => void;
  onFallbackToConsole?: () => void;
}

type Phase =
  | "connecting"
  | "waiting-hello"
  | "admitted"
  | "refused"
  | "degraded"
  | "console-required";

interface Caps {
  input: boolean;
  resize: boolean;
  clipboard: boolean;
  telemetry: boolean;
  captureW: number;
  captureH: number;
}

function wsUrlFor(namespace: string, name: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (API_BASE.startsWith("/")) {
    return `${protocol}//${window.location.host}${API_BASE}/proxy/${namespace}/${name}/agent/?purpose=v1.display`;
  }
  const base = API_BASE.replace(/\/+$/, "").replace(/^http/, "ws");
  return `${base}/proxy/${namespace}/${name}/agent/?purpose=v1.display`;
}

// Premium agent viewer over the proxy /agent/ bridge (purpose v1.display).
// The proxy owns the API grant and substitutes it for our attach; the guest
// admits exactly one controller. Premium-ready is reported only after guest
// admission plus the first presented video frame — connecting state, grant
// presence and media bytes alone are never shown as ready.
export default function AgentDisplay({
  workspaceName,
  namespace,
  onConnectionChange,
  onFallbackToConsole,
}: AgentDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [premiumReady, setPremiumReady] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [takeoverPrompt, setTakeoverPrompt] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const [caps, setCaps] = useState<Caps>({ input: false, resize: false, clipboard: false, telemetry: false, captureW: 0, captureH: 0 });
  const [deskReason, setDeskReason] = useState<string | null>(null);
  const [resizeNote, setResizeNote] = useState<string | null>(null);
  const [clipText, setClipText] = useState("");
  const [clipNote, setClipNote] = useState<string | null>(null);

  const notify = useCallback(
    (connected: boolean) => {
      setPremiumReady(connected);
      if (onConnectionChange) onConnectionChange(connected);
    },
    [onConnectionChange]
  );

  // Session refs (never state: hot read/write paths).
  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);
  const sentNsRef = useRef(0);
  const sessionRef = useRef("");
  const admittedRef = useRef(false);
  const disposedRef = useRef(false);
  const everAdmittedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const videoDecRef = useRef<VideoDecoder | null>(null);
  const audioDecRef = useRef<AudioDecoder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoTsRef = useRef(0);
  const audioTsRef = useRef(0);
  const presentedRef = useRef(false);
  const soundOnRef = useRef(false);
  const capsRef = useRef<Caps>({ input: false, resize: false, clipboard: false, telemetry: false, captureW: 0, captureH: 0 });
  const telemetryTimerRef = useRef<number | null>(null);
  const hiTicksRef = useRef(0);
  const pendingResizeRef = useRef<string | null>(null);
  const resizeCounterRef = useRef(0);
  const resizeTimerRef = useRef<number | null>(null);
  const pressedRef = useRef<Set<number>>(new Set());
  const connectFnRef = useRef<() => () => void>(() => () => {});
  const soundQueueRef = useRef<number>(0);

  const sendControl = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    const session = sessionRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !session) return false;
    seqRef.current += 1;
    sentNsRef.current = nextSentAtNs(sentNsRef.current);
    const frame = encodeControlFrame(controlEnvelope(session, seqRef.current, sentNsRef.current, type, payload));
    try {
      ws.send(frame.buffer as ArrayBuffer);
      return true;
    } catch {
      return false;
    }
  }, []);

  const markPremiumReady = useCallback(() => {
    if (presentedRef.current) return;
    presentedRef.current = true;
    reconnectAttemptRef.current = 0;
    setError(null);
    setPhase("admitted");
    notify(true);
  }, [notify]);

  const connect = useCallback(() => {
    const cancelled = { current: false };
    disposedRef.current = false;
    setError(null);
    setRefusal(null);
    setPhase("connecting");

    const open = () => {
      if (cancelled.current || disposedRef.current) return;
      // Pre-check the shared Tier 1 seat: premium display holds it, helpers
      // do not. Ask for takeover consent before dialling into a held seat.
      (async () => {
        let inUse = false;
        try {
          inUse = await checkTier1InUse(workspaceName, namespace);
        } catch {
          inUse = false;
        }
        if (cancelled.current || disposedRef.current) return;
        if (inUse) {
          setTakeoverPrompt(true);
          setPhase("connecting");
          return;
        }
        dial();
      })().catch(() => {
        if (!cancelled.current) {
          setError("Display status check failed");
          setPhase("degraded");
        }
      });
    };

    const dial = () => {
      if (cancelled.current || disposedRef.current) return;
      setPhase("waiting-hello");
      sessionRef.current = "";
      admittedRef.current = false;
      seqRef.current = 0;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrlFor(namespace, workspaceName));
      } catch {
        if (!cancelled.current) {
          setError("Failed to open the agent bridge");
          setPhase("degraded");
        }
        return;
      }
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled.current) return;
        // The guest speaks first (hello). Nothing to send yet.
      };

      ws.onmessage = (event: MessageEvent) => {
        if (cancelled.current || disposedRef.current) return;
        const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;
        if (!data) return;
        const frame = decodeFrame(data);
        if (!frame) {
          setError("Agent wire violation — closing the session");
          setPhase("degraded");
          try { ws.close(); } catch { /* ignore */ }
          return;
        }
        if (frame.tag === 0x00) void handleControl(frame.body);
        else if (frame.tag === 0x01) void handleVideo(frame.body);
        else void handleAudio(frame.body);
      };

      ws.onclose = () => {
        if (cancelled.current || disposedRef.current) return;
        wsRef.current = null;
        stopMedia();
        if (admittedRef.current || everAdmittedRef.current) {
          // Transport loss after admission: bounded auto-reconnect.
          admittedRef.current = false;
          notify(false);
          const attempt = reconnectAttemptRef.current + 1;
          reconnectAttemptRef.current = attempt;
          setPhase("degraded");
          setError("Agent transport lost — reconnecting…");
          const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15000);
          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = window.setTimeout(() => {
            if (!disposedRef.current) dial();
          }, delay);
        } else {
          setPhase("degraded");
          setError((prev) => prev ?? "Agent display disconnected");
        }
      };

      ws.onerror = () => {
        if (cancelled.current) return;
        // Handshake refusals (409 busy, 503 unconfigured, 401/403) surface
        // as a close without hello; the message stays generic here and the
        // takeover/refusal paths below say what is actually known.
      };
    };

    const handleControl = async (body: Uint8Array) => {
      const msg = parseControlBody(body);
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "hello") {
        const session = typeof msg.sessionId === "string" ? msg.sessionId : "";
        if (!session) return;
        sessionRef.current = session;
        const payload = (msg.payload ?? {}) as Record<string, unknown>;
        const capture = (payload.capture ?? {}) as { width?: unknown; height?: unknown };
        const w = typeof capture.width === "number" ? capture.width : 0;
        const h = typeof capture.height === "number" ? capture.height : 0;
        const next: Caps = {
          input: payload.inputAvailable === true,
          resize: payload.resizeAvailable === true,
          clipboard: payload.clipboardText === true,
          telemetry: payload.telemetryAvailable === true,
          captureW: w,
          captureH: h,
        };
        capsRef.current = next;
        setCaps(next);
        // The proxy substitutes its own edge-held grant for our attach
        // payload; we bind only the guest hello session here.
        sendControl("attach", { ticket: {} });
        return;
      }
      if (msg.type === "attachResult") {
        const payload = (msg.payload ?? {}) as { admitted?: unknown; reason?: unknown };
        if (payload.admitted === true) {
          admittedRef.current = true;
          everAdmittedRef.current = true;
          reconnectAttemptRef.current = 0;
          setPhase("admitted");
          sendControl("keyframeRequest", {});
          startTelemetry();
        } else {
          const reason = typeof payload.reason === "string" ? payload.reason : "ticket-refused";
          admittedRef.current = false;
          setRefusal(reason);
          setPhase("refused");
          setError(`Agent refused the session (${reason})`);
          try { wsRef.current?.close(); } catch { /* ignore */ }
        }
        return;
      }
      if (msg.type === "resizeAck") {
        const payload = (msg.payload ?? {}) as { requestId?: unknown; reason?: unknown; actual?: unknown };
        const id = typeof payload.requestId === "string" ? payload.requestId : "";
        if (pendingResizeRef.current && id === pendingResizeRef.current) {
          pendingResizeRef.current = null;
          const actual = payload.actual as { width?: unknown; height?: unknown } | undefined;
          if (actual && typeof actual.width === "number" && typeof actual.height === "number") {
            setResizeNote(`Guest mode ${actual.width}×${actual.height}`);
          } else if (typeof payload.reason === "string" && payload.reason) {
            setResizeNote(`Resize not applied (${payload.reason})`);
          } else {
            setResizeNote(null);
          }
        }
        return;
      }
      if (msg.type === "telemetry") {
        const payload = (msg.payload ?? {}) as Record<string, unknown>;
        const desktop = desktopRequiresConsole(payload, hiTicksRef.current + (needsHandoff(payload) ? 1 : 0));
        const session = payload.session as { desktop?: { requiresConsole?: unknown } } | undefined;
        const hi = session?.desktop?.requiresConsole === true && isHigherIntegrity(payload) ? hiTicksRef.current + 1 : 0;
        hiTicksRef.current = session?.desktop?.requiresConsole === true ? hi : 0;
        if (desktop.required) {
          setDeskReason(desktop.reason);
          setPhase("console-required");
        }
        return;
      }
      if (msg.type === "clipboardResult") {
        const payload = (msg.payload ?? {}) as { requestId?: unknown; ok?: unknown; text?: unknown; reason?: unknown };
        if (payload.ok === true && typeof payload.text === "string") {
          setClipText(payload.text.slice(0, 64 * 1024));
          setClipNote(null);
        } else if (payload.ok === true) {
          setClipNote("Sent to guest");
        } else {
          setClipNote(typeof payload.reason === "string" ? `Clipboard: ${payload.reason}` : "Clipboard unavailable");
        }
      }
    };

    const needsHandoff = (payload: Record<string, unknown>): boolean => {
      const session = payload.session as { desktop?: { requiresConsole?: unknown; reason?: unknown } } | undefined;
      return session?.desktop?.requiresConsole === true;
    };
    const isHigherIntegrity = (payload: Record<string, unknown>): boolean => {
      const session = payload.session as { desktop?: { reason?: unknown } } | undefined;
      return session?.desktop?.reason === "higher-integrity-window";
    };

    const handleVideo = async (unit: Uint8Array) => {
      if (!admittedRef.current) return;
      try {
        if (!videoDecRef.current) {
          const decoder = new VideoDecoder({
            output: (frame) => {
              try {
                const canvas = canvasRef.current;
                if (canvas) {
                  if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
                    canvas.width = frame.displayWidth;
                    canvas.height = frame.displayHeight;
                  }
                  const ctx = canvas.getContext("2d");
                  ctx?.drawImage(frame, 0, 0);
                }
                markPremiumReady();
              } finally {
                frame.close();
              }
            },
            error: (e) => {
              setError(`Video decode failed (${String(e)})`);
              setPhase("degraded");
            },
          });
          decoder.configure({ codec: "avc1.42E01E", optimizeForLatency: true });
          videoDecRef.current = decoder;
        }
        const decoder = videoDecRef.current;
        // Bounded queue: never let a slow decoder grow memory without bound.
        if (decoder.decodeQueueSize > 8) {
          if (!annexBHasIdr(unit)) return;
        }
        videoTsRef.current += 33_333;
        decoder.decode(new EncodedVideoChunk({
          type: annexBHasIdr(unit) ? "key" : "delta",
          timestamp: videoTsRef.current,
          data: unit,
        }));
      } catch (e) {
        setError(`Video pipeline failed (${e instanceof Error ? e.message : String(e)})`);
        setPhase("degraded");
      }
    };

    const handleAudio = async (packet: Uint8Array) => {
      if (!admittedRef.current || !soundOnRef.current) return;
      try {
        if (!audioDecRef.current || !audioCtxRef.current) return;
        const decoder = audioDecRef.current;
        if (decoder.decodeQueueSize > 16) return;
        audioTsRef.current += 20_000;
        decoder.decode(new EncodedAudioChunk({
          type: "key",
          timestamp: audioTsRef.current,
          data: packet,
        }));
      } catch {
        // Audio is best-effort; video stays authoritative.
      }
    };

    const startTelemetry = () => {
      if (telemetryTimerRef.current) window.clearInterval(telemetryTimerRef.current);
      if (!capsRef.current.telemetry) return;
      sendControl("telemetry", {});
      telemetryTimerRef.current = window.setInterval(() => {
        if (!admittedRef.current) return;
        sendControl("telemetry", {});
      }, 1000);
    };

    const stopMedia = () => {
      if (telemetryTimerRef.current) {
        window.clearInterval(telemetryTimerRef.current);
        telemetryTimerRef.current = null;
      }
      try { videoDecRef.current?.close(); } catch { /* ignore */ }
      videoDecRef.current = null;
      // Audio context survives reconnects (user gesture); decoder resets.
      try { audioDecRef.current?.close(); } catch { /* ignore */ }
      audioDecRef.current = null;
      soundQueueRef.current = 0;
    };

    open();
    return () => {
      cancelled.current = true;
    };
  }, [workspaceName, namespace, sendControl, markPremiumReady, notify]);

  useEffect(() => {
    connectFnRef.current = connect;
  }, [connect]);

  // Session lifecycle: connect once, tear down on unmount. setState only
  // through the guarded IIFE/cancellation pattern.
  useEffect(() => {
    const cancelConnect = connectFnRef.current();
    return () => {
      cancelConnect();
      disposedRef.current = true;
      try {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && admittedRef.current && sessionRef.current) {
          seqRef.current += 1;
          sentNsRef.current = nextSentAtNs(sentNsRef.current);
          ws.send(encodeControlFrame(controlEnvelope(sessionRef.current, seqRef.current, sentNsRef.current, "bye", {})).buffer as ArrayBuffer);
        }
      } catch { /* best-effort bye */ }
      try { wsRef.current?.close(); } catch { /* ignore */ }
      wsRef.current = null;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (telemetryTimerRef.current) window.clearInterval(telemetryTimerRef.current);
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      try { videoDecRef.current?.close(); } catch { /* ignore */ }
      try { audioDecRef.current?.close(); } catch { /* ignore */ }
      try { audioCtxRef.current?.close(); } catch { /* ignore */ }
      videoDecRef.current = null;
      audioDecRef.current = null;
      audioCtxRef.current = null;
      admittedRef.current = false;
      notify(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceName, namespace]);

  // Real resize: coalesce (500ms), newest wins; observers only scale locally
  // (not applicable — premium stays exclusive-controller until W7).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        if (disposedRef.current || !admittedRef.current || !capsRef.current.resize) return;
        const host = containerRef.current;
        if (!host || host.clientWidth <= 0 || host.clientHeight <= 0) return;
        const size = clampResizeSize(host.clientWidth, host.clientHeight);
        resizeCounterRef.current += 1;
        const id = `rs-${resizeCounterRef.current}-${size.width}x${size.height}`;
        pendingResizeRef.current = id;
        sendControl("resizeRequest", { requestId: id, width: size.width, height: size.height });
      }, 500);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
    };
  }, [sendControl, phase]);

  const reconnectNow = useCallback(() => {
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    try { wsRef.current?.close(); } catch { /* ignore */ }
    wsRef.current = null;
    admittedRef.current = false;
    presentedRef.current = false;
    hiTicksRef.current = 0;
    setDeskReason(null);
    notify(false);
    connectFnRef.current();
  }, [notify]);

  const handleTakeover = useCallback(async () => {
    setTakeoverBusy(true);
    try {
      await takeOverTier1(workspaceName, namespace);
      setTakeoverPrompt(false);
      reconnectNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Take over failed");
    } finally {
      setTakeoverBusy(false);
    }
  }, [workspaceName, namespace, reconnectNow]);

  const toggleSound = useCallback(async () => {
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    setAudioReady(false);
    if (next) {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        await audioCtxRef.current.resume();
        if (!audioDecRef.current) {
          const ctx = audioCtxRef.current;
          const decoder = new AudioDecoder({
            output: (data) => {
              try {
                if (soundQueueRef.current > 32) {
                  data.close();
                  return;
                }
                const frames = data.numberOfFrames;
                const channels = Math.min(data.numberOfChannels, 2);
                const rate = data.sampleRate;
                const buffer = ctx.createBuffer(channels, frames, rate);
                for (let ch = 0; ch < channels; ch++) {
                  const dest = new Float32Array(frames);
                  data.copyTo(dest, { planeIndex: ch, format: "f32-planar" });
                  buffer.copyToChannel(dest, ch, 0);
                }
                const src = ctx.createBufferSource();
                src.buffer = buffer;
                src.connect(ctx.destination);
                soundQueueRef.current += 1;
                src.onended = () => {
                  soundQueueRef.current = Math.max(0, soundQueueRef.current - 1);
                };
                src.start();
                setAudioReady(true);
              } finally {
                data.close();
              }
            },
            error: () => {
              setAudioReady(false);
            },
          });
          decoder.configure({ codec: "opus", sampleRate: 48000, numberOfChannels: 2 });
          audioDecRef.current = decoder;
        }
      } catch {
        soundOnRef.current = false;
        setSoundOn(false);
      }
    } else {
      try { audioDecRef.current?.close(); } catch { /* ignore */ }
      audioDecRef.current = null;
      soundQueueRef.current = 0;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen().catch(() => {});
    }
  }, []);

  const sendPointer = useCallback((clientX: number, clientY: number, buttons: number) => {
    if (!admittedRef.current || !capsRef.current.input || deskReason) return;
    const canvas = canvasRef.current;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;
    const box = canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const x = Math.max(0, Math.min(canvas.width, Math.floor(((clientX - box.left) / box.width) * canvas.width)));
    const y = Math.max(0, Math.min(canvas.height, Math.floor(((clientY - box.top) / box.height) * canvas.height)));
    sendControl("input", { kind: "pointer", x, y, buttons });
  }, [sendControl, deskReason]);

  const handlePointer = useCallback((e: React.PointerEvent) => {
    let mask = 0;
    if (e.buttons & 1) mask |= 1;
    if (e.buttons & 2) mask |= 4;
    if (e.buttons & 4) mask |= 2;
    if ((e.type === "pointerdown" || e.type === "pointerup") && e.button === 0) {
      mask = e.type === "pointerdown" ? mask | 1 : mask & ~1;
    }
    if ((e.type === "pointerdown" || e.type === "pointerup") && e.button === 1) {
      mask = e.type === "pointerdown" ? mask | 4 : mask & ~4;
    }
    if ((e.type === "pointerdown" || e.type === "pointerup") && e.button === 2) {
      mask = e.type === "pointerdown" ? mask | 2 : mask & ~2;
    }
    sendPointer(e.clientX, e.clientY, mask);
  }, [sendPointer]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!admittedRef.current || !capsRef.current.input || deskReason) return;
    const dx = Math.max(-1000, Math.min(1000, Math.round(e.deltaX)));
    const dy = Math.max(-1000, Math.min(1000, Math.round(e.deltaY)));
    if (dx !== 0 || dy !== 0) sendControl("input", { kind: "wheel", dx, dy });
  }, [sendControl, deskReason]);

  const handleKey = useCallback((e: React.KeyboardEvent, down: boolean) => {
    if (!admittedRef.current || !capsRef.current.input || deskReason) return;
    const keysym = keyToKeysym(e.key);
    if (keysym === null) return;
    e.preventDefault();
    if (down) pressedRef.current.add(keysym);
    else pressedRef.current.delete(keysym);
    sendControl("input", { kind: "key", keysym, down });
  }, [sendControl, deskReason]);

  const releaseKeys = useCallback(() => {
    for (const keysym of pressedRef.current) {
      sendControl("input", { kind: "key", keysym, down: false });
    }
    pressedRef.current.clear();
  }, [sendControl]);

  const requestClipboard = useCallback(() => {
    if (!admittedRef.current || !capsRef.current.clipboard) return;
    const id = `clipboard-get-${Date.now()}`;
    setClipNote("Reading…");
    sendControl("clipboardGet", { requestId: id });
  }, [sendControl]);

  const sendClipboard = useCallback(() => {
    if (!admittedRef.current || !capsRef.current.clipboard) return;
    if (clipText.length > 64 * 1024) {
      setClipNote("Clipboard text exceeds 64 KiB");
      return;
    }
    if (clipText.includes("\0")) {
      setClipNote("Clipboard text must not contain NUL");
      return;
    }
    const id = `clipboard-set-${Date.now()}`;
    setClipNote("Sending…");
    sendControl("clipboardSet", { requestId: id, text: clipText });
  }, [sendControl, clipText]);

  if (takeoverPrompt) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]">
        <div className="text-center max-w-md p-6">
          <p className="text-yellow-400 mb-4 text-sm">
            The premium display is currently held by another session. Take over with consent, or use the console instead.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleTakeover}
              disabled={takeoverBusy}
              className={`px-4 py-2 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors ${takeoverBusy ? "opacity-75 cursor-not-allowed" : ""}`}
            >
              {takeoverBusy ? "Taking over…" : "Take over"}
            </button>
            {onFallbackToConsole && (
              <button
                onClick={onFallbackToConsole}
                className="px-4 py-2 text-sm bg-[var(--color-secondary)] hover:bg-[var(--color-secondary-hover)] text-[var(--color-secondary-foreground)] rounded transition-colors"
              >
                Use console
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if ((phase === "refused" || phase === "degraded") && !premiumReady) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1a1b26] p-6 text-center">
        <p className="text-red-400 text-sm">{error ?? "Agent display unavailable"}</p>
        {refusal && <p className="text-xs text-gray-500">Refusal: {refusal}. A refused or busy seat never falls back silently — choose where to go.</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={reconnectNow}
            className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors"
          >
            Reconnect premium
          </button>
          {onFallbackToConsole && (
            <button
              onClick={onFallbackToConsole}
              className="px-3 py-1.5 text-sm bg-[var(--color-secondary)] hover:bg-[var(--color-secondary-hover)] text-[var(--color-secondary-foreground)] rounded transition-colors"
            >
              Open console instead
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full"
        style={{ touchAction: "none" }}
        tabIndex={0}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerUp={handlePointer}
        onWheel={handleWheel}
        onKeyDown={(e) => handleKey(e, true)}
        onKeyUp={(e) => handleKey(e, false)}
        onBlur={releaseKeys}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute top-2 right-3 flex items-center gap-2 z-10">
        <button
          onClick={toggleSound}
          disabled={!premiumReady}
          title={soundOn ? "Mute audio" : "Enable audio"}
          className={`px-2.5 py-1 text-xs rounded transition-colors disabled:opacity-40 ${soundOn ? "bg-green-700/80 text-green-100 hover:bg-green-600/80" : "bg-gray-800/80 text-gray-300 hover:bg-gray-700/80"}`}
        >
          Sound: {soundOn ? (audioReady ? "On" : "Starting…") : "Off"}
        </button>
        <button
          onClick={toggleFullscreen}
          className="px-2.5 py-1 text-xs rounded bg-gray-800/80 text-gray-300 hover:bg-gray-700/80 transition-colors"
        >
          Fullscreen
        </button>
        <div className={`w-2.5 h-2.5 rounded-full ${premiumReady ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
        <span className={`text-xs ${premiumReady ? "text-gray-400" : "text-gray-600"}`}>
          {premiumReady ? "Premium connected" : phase === "admitted" ? "Decoding…" : "Connecting…"}
        </span>
      </div>
      {phase === "console-required" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-md bg-black/70 rounded px-3 py-2 backdrop-blur text-center">
          <p className="text-xs text-yellow-300">
            {deskReason === "protected-desktop"
              ? "Windows is showing a protected screen (secure desktop). Input and capture pause here."
              : "An elevated window is blocking agent input."}{" "}
            Use the authenticated console to continue.
          </p>
          {onFallbackToConsole && (
            <button
              onClick={onFallbackToConsole}
              className="mt-1 px-3 py-1 text-xs bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors"
            >
              Open console
            </button>
          )}
        </div>
      )}
      {resizeNote && (
        <div className="absolute bottom-3 right-3 z-10 bg-black/50 rounded px-2 py-1 backdrop-blur">
          <span className="text-[11px] text-gray-400">{resizeNote}</span>
        </div>
      )}
      {caps.clipboard && premiumReady && (
        <details className="absolute bottom-3 left-3 z-10 bg-black/50 rounded px-2 py-1 backdrop-blur">
          <summary className="text-[11px] text-gray-400 cursor-pointer">Clipboard</summary>
          <div className="flex flex-col gap-1 mt-1 w-56">
            <textarea
              value={clipText}
              onChange={(e) => setClipText(e.target.value)}
              rows={2}
              className="text-xs bg-gray-900 text-gray-200 rounded p-1"
              placeholder="Guest clipboard text"
            />
            <div className="flex gap-1">
              <button onClick={requestClipboard} className="flex-1 px-2 py-0.5 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-100 rounded">Read</button>
              <button onClick={sendClipboard} className="flex-1 px-2 py-0.5 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-100 rounded">Send</button>
            </div>
            {clipNote && <span className="text-[11px] text-gray-500">{clipNote}</span>}
          </div>
        </details>
      )}
    </div>
  );
}
