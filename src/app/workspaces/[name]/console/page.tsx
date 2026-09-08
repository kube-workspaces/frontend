"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { getWorkspace } from "@/lib/api";
import { useSerialConsole } from "@/lib/use-serial-console";
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

  const serial = useSerialConsole({
    workspaceName: name,
    namespace,
    containerRef: terminalRef,
    isVM,
    // Clean closes: "taken over" (VM console evicted) just shows the message;
    // a shell exit in a container workspace should also close this tab.
    onCleanClose: (reason) => {
      if (reason.startsWith("taken over") || isVM) return;
      window.close();
    },
  });

  const { connect, dispose } = serial;

  useEffect(() => {
    if (mode !== "serial") return;
    connect();
    return dispose;
  }, [mode, connect, dispose]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1b26]">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#24283b] border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              (mode === "serial" ? serial.isConnected : displayConnected) ? "bg-green-500" : "bg-red-500"
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
            ? serial.isConnected
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
            {serial.error && !serial.takeoverPrompt && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]/90 z-10">
                <div className="text-center">
                  <p className="text-red-400 text-sm mb-2">{serial.error}</p>
                  <button
                    onClick={() => serial.connect()}
                    className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors"
                  >
                    Reconnect
                  </button>
                </div>
              </div>
            )}
            {serial.takeoverPrompt && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]/90 z-10">
                <div className="text-center max-w-md px-6">
                  <p className="text-gray-200 text-sm font-medium mb-1">Console in use</p>
                  <p className="text-gray-500 text-xs mb-4">
                    Another session is connected to this serial console. Disconnect it and take over?
                  </p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={serial.handleTakeoverCancel}
                      disabled={serial.takeoverBusy}
                      className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={serial.handleTakeover}
                      disabled={serial.takeoverBusy}
                      className="px-3 py-1.5 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {serial.takeoverBusy ? "Taking over…" : "Take over"}
                    </button>
                  </div>
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