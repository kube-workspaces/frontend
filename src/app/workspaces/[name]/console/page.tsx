"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { getWorkspace, listImages } from "@/lib/api";
import { useSerialConsole } from "@/lib/use-serial-console";
import { useSSHConsole } from "@/lib/use-ssh-console";
import VncDisplay from "@/components/vnc-display";
import SSHCredentialForm from "@/components/ssh-credential-form";

type ConsoleMode = "serial" | "ssh" | "display";

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
  const initialMode =
    searchParams.get("mode") === "display"
      ? "display"
      : searchParams.get("mode") === "ssh"
        ? "ssh"
        : "serial";

  const terminalRef = useRef<HTMLDivElement>(null);
  const [isVM, setIsVM] = useState(false);
  const [sshDefaultUser, setSshDefaultUser] = useState("debian");
  const [sshUser, setSshUser] = useState("");
  const [sshPrivateKey, setSshPrivateKey] = useState("");
  const [mode, setMode] = useState<ConsoleMode>(initialMode);
  const [displayConnected, setDisplayConnected] = useState(false);

  // VM workspaces expose a graphical VNC display alongside the serial console;
  // container/scratch workspaces only have a terminal. The image's default user
  // is hinted to the SSH credential form.
  useEffect(() => {
    let cancelled = false;
    getWorkspace(name, namespace)
      .then(async (ws) => {
        if (cancelled) return;
        setIsVM(ws.type === "vm");
        try {
          const images = await listImages();
          const img = images.find((i) => i.image === ws.image);
          if (!cancelled && img?.default_user)
            setSshDefaultUser(img.default_user);
        } catch {
          // keep the fallback default user
        }
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

  const ssh = useSSHConsole({
    workspaceName: name,
    namespace,
    containerRef: terminalRef,
    user: sshUser,
    privateKey: sshPrivateKey,
    onCleanClose: (reason) => {
      if (!reason.startsWith("taken over")) window.close();
    },
  });

  const activeConnected =
    mode === "display"
      ? displayConnected
      : mode === "ssh"
        ? ssh.isConnected
        : serial.isConnected;

  const serialConnect = serial.connect;
  const serialDispose = serial.dispose;

  useEffect(() => {
    if (mode !== "serial") return;
    serialConnect();
    return serialDispose;
  }, [mode, serialConnect, serialDispose]);

  const sshConnect = ssh.connect;
  const sshDispose = ssh.dispose;

  useEffect(() => {
    if (mode !== "ssh" || !sshUser || !sshPrivateKey) return;
    sshConnect();
    return sshDispose;
  }, [mode, sshUser, sshPrivateKey, sshConnect, sshDispose]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1b26]">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#24283b] border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              activeConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm font-medium text-gray-200">{name}</span>
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
                onClick={() => setMode("ssh")}
                className={`px-2.5 py-0.5 text-xs rounded transition-colors ${
                  mode === "ssh"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                }`}
              >
                SSH
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
          {mode === "display"
            ? displayConnected
              ? "Connected"
              : "Disconnected"
            : mode === "ssh"
              ? ssh.isConnected
                ? "Connected"
                : "Disconnected"
              : serial.isConnected
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
            {mode === "ssh" && (!sshUser || !sshPrivateKey) && (
              <SSHCredentialForm
                defaultUser={sshDefaultUser}
                onSubmit={(user, key) => {
                  setSshUser(user);
                  setSshPrivateKey(key);
                }}
              />
            )}
            {(mode !== "ssh" ? serial.error : ssh.error) &&
              !(mode === "ssh"
                ? ssh.takeoverPrompt
                : serial.takeoverPrompt) && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]/90 z-10">
                  <div className="text-center">
                    <p className="text-red-400 text-sm mb-2">
                      {mode === "ssh" ? ssh.error : serial.error}
                    </p>
                    <button
                      onClick={() =>
                        mode === "ssh" ? ssh.connect() : serial.connect()
                      }
                      className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors"
                    >
                      Reconnect
                    </button>
                  </div>
                </div>
              )}
            {(mode === "ssh" ? ssh.takeoverPrompt : serial.takeoverPrompt) && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]/90 z-10">
                <div className="text-center max-w-md px-6">
                  <p className="text-gray-200 text-sm font-medium mb-1">
                    {mode === "ssh" ? "SSH console in use" : "Console in use"}
                  </p>
                  <p className="text-gray-500 text-xs mb-4">
                    Another session is connected to this{" "}
                    {mode === "ssh" ? "SSH console" : "serial console"}.
                    Disconnect it and take over?
                  </p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={
                        mode === "ssh"
                          ? ssh.handleTakeoverCancel
                          : serial.handleTakeoverCancel
                      }
                      disabled={
                        mode === "ssh" ? ssh.takeoverBusy : serial.takeoverBusy
                      }
                      className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={
                        mode === "ssh"
                          ? ssh.handleTakeover
                          : serial.handleTakeover
                      }
                      disabled={
                        mode === "ssh" ? ssh.takeoverBusy : serial.takeoverBusy
                      }
                      className="px-3 py-1.5 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {(mode === "ssh" ? ssh.takeoverBusy : serial.takeoverBusy)
                        ? "Taking over…"
                        : "Take over"}
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
