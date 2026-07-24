"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { API_BASE } from "@/lib/api";

interface TerminalModalProps {
  workspaceName: string;
  namespace: string;
  onClose: () => void;
}

export default function TerminalModal({
  workspaceName,
  namespace,
  onClose,
}: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState("");

  const connect = useCallback(() => {
    if (!terminalRef.current) return;

    // Create terminal
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
    term.open(terminalRef.current);

    // Intercept Ctrl+Escape at the terminal level to close the modal.
    // xterm captures all key events, so window-level listeners won't fire.
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.key === "Escape" && e.ctrlKey && e.type === "keydown") {
        onClose();
        return false; // Prevent xterm from processing this key
      }
      return true; // Let xterm handle all other keys
    });

    // Fit after a brief delay to ensure the container has rendered
    setTimeout(() => fit.fit(), 50);

    terminalInstance.current = term;
    fitAddon.current = fit;

    // Determine WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;

    // Build the exec URL - goes through the frontend proxy to the API
    const cols = term.cols;
    const rows = term.rows;
    const wsUrl = `${protocol}//${host}${API_BASE}/v1/workspaces/${workspaceName}/exec?namespace=${namespace}&cols=${cols}&rows=${rows}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setSessionStart(Date.now());
      setError(null);
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
      if (event.code === 1000) {
        // Clean shell exit (e.g. user typed "exit") — auto-close the modal
        onClose();
      } else {
        // Abnormal close — keep open for inspection
        term.write("\r\n\x1b[31mConnection closed.\x1b[0m\r\n");
      }
    };

    ws.onerror = () => {
      setError("Failed to connect to workspace terminal");
      setIsConnected(false);
    };

    // Send terminal input to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle terminal resize
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    // Handle window resize
    const handleResize = () => {
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [workspaceName, namespace, onClose]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      if (cleanup) cleanup();
    };
  }, [connect]);

  // Refit terminal when maximized state changes
  useEffect(() => {
    setTimeout(() => {
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
    }, 100);
  }, [isMaximized]);

  const handleOpenInNewTab = () => {
    window.open(
      `/workspaces/${workspaceName}/console?namespace=${namespace}`,
      "_blank"
    );
    onClose();
  };

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.ctrlKey) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Session duration timer
  useEffect(() => {
    if (!sessionStart || !isConnected) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const secs = Math.floor((Date.now() - sessionStart) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      if (h > 0) {
        setElapsed(`${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      } else {
        setElapsed(`${m}:${String(s).padStart(2, "0")}`);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sessionStart, isConnected]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isMaximized) onClose();
      }}
    >
      <div
        className={`bg-[#1a1b26] border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized
            ? "fixed inset-0 rounded-none border-0"
            : "w-[90vw] h-[80vh] max-w-6xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#24283b] border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-3 h-3 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`}
              />
            </div>
            <span className="text-sm font-medium text-gray-200">
              Console: {workspaceName}
            </span>
            <span className="text-xs text-gray-500">({namespace})</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Open in new tab */}
            <button
              onClick={handleOpenInNewTab}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
              title="Open in new tab"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </button>
            {/* Maximize/Restore */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                  />
                </svg>
              )}
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-red-600/80 rounded transition-colors"
              title="Close (Ctrl+Esc)"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Terminal area */}
        <div className="flex-1 relative overflow-hidden">
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]/90 z-10">
              <div className="text-center">
                <p className="text-red-400 text-sm mb-2">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    // Reconnect
                    if (wsRef.current) wsRef.current.close();
                    if (terminalInstance.current) terminalInstance.current.dispose();
                    connect();
                  }}
                  className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors"
                >
                  Reconnect
                </button>
              </div>
            </div>
          )}
          <div ref={terminalRef} className="absolute inset-0 p-1" />
        </div>

        {/* Footer status bar */}
        <div className="flex items-center justify-between px-4 py-1 bg-[#24283b] border-t border-gray-700 text-xs text-gray-500 shrink-0">
          <span>
            {isConnected ? "Connected" : "Disconnected"}
            {elapsed && <span className="ml-2 text-gray-600">{elapsed}</span>}
            {" "}| Ctrl+Esc to close
          </span>
          <span>{workspaceName}-0</span>
        </div>
      </div>
    </div>
  );
}
