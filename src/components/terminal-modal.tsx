"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { useSerialConsole } from "@/lib/use-serial-console";

interface TerminalModalProps {
  workspaceName: string;
  namespace: string;
  onClose: () => void;
  isVM?: boolean;
}

export default function TerminalModal({
  workspaceName,
  namespace,
  onClose,
  isVM = false,
}: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const startedAt = useRef(0);

  const serial = useSerialConsole({
    workspaceName,
    namespace,
    containerRef: terminalRef,
    isVM,
    // A clean shell exit (container) auto-closes the modal; a take-over of the
    // VM serial console just shows the "Connection closed." message.
    onCleanClose: (reason) => {
      if (!reason.startsWith("taken over")) onClose();
    },
  });

  const { connect, dispose } = serial;

  useEffect(() => {
    connect();
    return dispose;
  }, [connect, dispose]);

  // Close on Ctrl+Escape.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.ctrlKey) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Session duration timer
  useEffect(() => {
    if (!serial.isConnected) return;
    startedAt.current = Date.now();
    const tick = () => {
      const secs = Math.floor((Date.now() - startedAt.current) / 1000);
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
    return () => { clearInterval(interval); };
  }, [serial.isConnected]);

  const handleOpenInNewTab = () => {
    window.open(
      `/workspaces/${workspaceName}/console?namespace=${namespace}`,
      "_blank"
    );
    onClose();
  };

  const handleOpenDisplay = () => {
    window.open(
      `/workspaces/${workspaceName}/console?namespace=${namespace}&mode=display`,
      "_blank"
    );
    onClose();
  };

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
                  serial.isConnected ? "bg-green-500" : "bg-red-500"
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
            {/* Open VNC display for VM workspaces */}
            {isVM && (
              <button
                onClick={handleOpenDisplay}
                className="px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                title="Open graphical display (noVNC)"
              >
                Display
              </button>
            )}
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
        </div>

        {/* Footer status bar */}
        <div className="flex items-center justify-between px-4 py-1 bg-[#24283b] border-t border-gray-700 text-xs text-gray-500 shrink-0">
          <span>
            {serial.isConnected ? "Connected" : "Disconnected"}
            {serial.isConnected && elapsed && <span className="ml-2 text-gray-600">{elapsed}</span>}
            {" "}| Ctrl+Esc to close
          </span>
          <span>{workspaceName}-0</span>
        </div>
      </div>
    </div>
  );
}