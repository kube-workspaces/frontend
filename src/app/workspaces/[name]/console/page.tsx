"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { API_BASE, getWorkspace } from "@/lib/api";
import VncDisplay from "@/components/vnc-display";

export default function ConsolePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-[#1a1b26]">
          <span className="text-gray-400 text-sm">Connecting...</span>
        </div>
      }
    >
      <ConsoleContent />
    </Suspense>
  );
}

function ConsoleContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const name = params.name as string;
  const namespace = searchParams.get("namespace") || "workspaces";
  const initialMode = searchParams.get("mode") === "display" ? "display" : "serial";

  const terminalRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVM, setIsVM] = useState(false);
  const [mode, setMode] = useState<"serial" | "display">(initialMode);
  const [displayConnected, setDisplayConnected] = useState(false);

  // VM workspaces expose a graphical VNC display alongside the serial console;
  // container/scratch workspaces only have a terminal.
  useEffect(() => {
    let cancelled = false;
    getWorkspace(name, namespace)
      .then((ws) => {
        if (!cancelled) setIsVM(ws.type === "vm");
      })
      .catch(() => {
        if (!cancelled) setIsVM(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, namespace]);

  const connect = useCallback(() => {
    if (!terminalRef.current) return;

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

    setTimeout(() => fit.fit(), 50);

    // Set page title
    document.title = `Console: ${name}`;

    // WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const cols = term.cols;
    const rows = term.rows;
    const wsUrl = `${protocol}//${host}${API_BASE}/v1/workspaces/${name}/exec?namespace=${namespace}&cols=${cols}&rows=${rows}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setIsConnected(true);
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
        // Clean shell exit — show exit message and try to close the tab
        term.write("\r\n\x1b[32mShell exited. You may close this tab.\x1b[0m\r\n");
        // Try to close (works if opened via window.open)
        window.close();
      } else {
        term.write("\r\n\x1b[31mConnection closed.\x1b[0m\r\n");
      }
    };

    ws.onerror = () => {
      setError("Failed to connect to workspace terminal");
      setIsConnected(false);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const handleResize = () => fit.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [name, namespace]);

  useEffect(() => {
    if (mode !== "serial") return;
    const cleanup = connect();
    return () => {
      if (cleanup) cleanup();
    };
  }, [connect, mode]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1b26]">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#24283b] border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              (mode === "serial" ? isConnected : displayConnected) ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm font-medium text-gray-200">
            {name}
          </span>
          <span className="text-xs text-gray-500">({namespace})</span>
          {isVM && (
            <div className="ml-2 flex items-center gap-1 bg-[#1a1b26] rounded-md p-0.5 border border-gray-700">
              <button
                onClick={() => setMode("serial")}
                className={`px-2.5 py-0.5 text-xs rounded transition-colors ${
                  mode === "serial"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                }`}
              >
                Serial
              </button>
              <button
                onClick={() => setMode("display")}
                className={`px-2.5 py-0.5 text-xs rounded transition-colors ${
                  mode === "display"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                }`}
              >
                Display
              </button>
            </div>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {mode === "serial"
            ? isConnected
              ? "Connected"
              : "Disconnected"
            : displayConnected
            ? "Connected"
            : "Disconnected"}
        </span>
      </div>

      {/* Terminal / Display */}
      <div className="flex-1 relative overflow-hidden">
        {mode === "display" ? (
          <VncDisplay
            workspaceName={name}
            namespace={namespace}
            onConnectionChange={setDisplayConnected}
          />
        ) : (
          <>
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]/90 z-10">
                <div className="text-center">
                  <p className="text-red-400 text-sm mb-2">{error}</p>
                  <button
                    onClick={() => {
                      setError(null);
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
          </>
        )}
      </div>
    </div>
  );
}
