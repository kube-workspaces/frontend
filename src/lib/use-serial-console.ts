import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { API_BASE, checkSerialConsoleInUse, takeOverSerialConsole } from "@/lib/api";

const MAX_RECONNECT_ATTEMPTS = 12;

interface UseSerialConsoleOptions {
  workspaceName: string;
  namespace: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** True when the workspace is a VM (its exec endpoint is the serial console). */
  isVM: boolean;
  /** Called on a clean close (code 1000), e.g. a shell exit or a take-over. */
  onCleanClose?: (reason: string) => void;
}

// useSerialConsole wires an xterm over the /v1/workspaces/{name}/exec WebSocket,
// which for VM workspaces is the KubeVirt serial console and for container
// workspaces is pod exec. It handles:
//   - take-over consent: VM serial consoles are single-session, so when another
//     session holds the console the user is prompted before disconnecting them;
//   - auto-reconnect with backoff after an abnormal close (network blips, Rancher
//     reconnects), while respecting a clean close such as "taken over by another
//     user" so the evicted tab doesn't fight the new owner.
export function useSerialConsole({
  workspaceName,
  namespace,
  containerRef,
  isVM,
  onCleanClose,
}: UseSerialConsoleOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [takeoverPrompt, setTakeoverPrompt] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);

  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempt = useRef(0);
  const everConnected = useRef(false);
  const disposed = useRef(false);
  const takeoverApproved = useRef(false);
  const onCleanCloseRef = useRef(onCleanClose);
  const openWSRef = useRef<() => void>(() => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const write = useCallback((text: string) => {
    termRef.current?.write(text);
  }, []);

  const scheduleReconnect = useCallback(() => {
    const attempt = reconnectAttempt.current + 1;
    reconnectAttempt.current = attempt;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      setError("Connection lost. Reload to reconnect.");
      return;
    }
    const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15000);
    write(`\r\n\x1b[90mReconnecting in ${Math.ceil(delay / 1000)}s…\x1b[0m\r\n`);
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = window.setTimeout(() => openWSRef.current(), delay);
  }, [write]);

  const openWS = useCallback(() => {
    if (disposed.current || !termRef.current) return;
    const term = termRef.current;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}${API_BASE}/v1/workspaces/${workspaceName}/exec?namespace=${namespace}&cols=${term.cols}&rows=${term.rows}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setError(null);
      setIsConnected(true);
      reconnectAttempt.current = 0;
      everConnected.current = true;
      term.focus();
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      } else {
        term.write(event.data);
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      if (disposed.current) return;
      if (event.code === 1000) {
        const reason = event.reason ? ` ${event.reason}` : "";
        write(`\r\n\x1b[90mConnection closed.${reason}\x1b[0m\r\n`);
        onCleanCloseRef.current?.(event.reason);
        return;
      }
      // Only auto-reconnect sessions that actually established once; a connect
      // that never opened (e.g. the console is held by someone else) surfaces
      // as an error instead of entering a reconnect loop.
      if (everConnected.current) {
        scheduleReconnectRef.current();
      } else {
        write("\r\n\x1b[31mConnection closed.\x1b[0m\r\n");
        setError("Failed to connect to workspace terminal");
      }
    };

    ws.onerror = () => {
      if (!everConnected.current) {
        setError("Failed to connect to workspace terminal");
        setIsConnected(false);
      }
    };
  }, [workspaceName, namespace, write]);

  // Keep the latest callbacks available to the websocket handlers without
  // re-binding them on every render.
  useEffect(() => {
    onCleanCloseRef.current = onCleanClose;
    openWSRef.current = openWS;
    scheduleReconnectRef.current = scheduleReconnect;
  });

  const createTerminal = useCallback(() => {
    if (termRef.current || !containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: "#1a1b26",
        foreground: "#a9b1d6",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#c0caf5",
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(webLinks);
    term.open(containerRef.current);
    setTimeout(() => fit.fit(), 50);

    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });
    term.onResize(({ cols, rows }) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    termRef.current = term;
  }, [containerRef]);

  const connect = useCallback(async () => {
    // A previous effect cleanup may have marked this disposed; re-arm it.
    disposed.current = false;
    createTerminal();
    if (!termRef.current) return;
    setError(null);
    setIsConnected(false);

    // VM serial consoles are single-session; if another session holds the
    // console, ask for consent before forcing them off.
    if (isVM) {
      let inUse = false;
      try {
        inUse = await checkSerialConsoleInUse(workspaceName, namespace);
      } catch {
        inUse = false; // fail-open: a status hiccup should not block the console
      }
      if (inUse && !takeoverApproved.current) {
        setTakeoverPrompt(true);
        return;
      }
    }
    openWSRef.current();
  }, [createTerminal, isVM, workspaceName, namespace]);

  const handleTakeover = useCallback(async () => {
    setTakeoverBusy(true);
    try {
      if (!takeoverApproved.current) {
        await takeOverSerialConsole(workspaceName, namespace);
        takeoverApproved.current = true;
      }
      setTakeoverPrompt(false);
      openWSRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Take over failed");
    } finally {
      setTakeoverBusy(false);
    }
  }, [workspaceName, namespace]);

  const handleTakeoverCancel = useCallback(() => {
    setTakeoverPrompt(false);
    setError("Console is in use by another session. Reconnect to retry.");
  }, []);

  const dispose = useCallback(() => {
    disposed.current = true;
    if (wsRef.current) wsRef.current.close();
    wsRef.current = null;
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
  }, []);

  useEffect(() => dispose, [dispose]);

  return {
    isConnected,
    error,
    takeoverPrompt,
    takeoverBusy,
    connect,
    handleTakeover,
    handleTakeoverCancel,
    dispose,
  };
}