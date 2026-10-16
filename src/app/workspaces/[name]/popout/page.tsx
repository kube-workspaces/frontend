"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import SharedDisplay from "@/components/shared-display";

// Viewport-only observer window: no site chrome, no modal — just the shared
// display. Opened via the Observe tab's pop-out button for second-monitor
// watching while working in the main window.
export default function ObservePopoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-[#1a1b26]">
          <span className="text-gray-400 text-sm">Connecting...</span>
        </div>
      }
    >
      <ObservePopoutContent />
    </Suspense>
  );
}

function ObservePopoutContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const name = params.name as string;
  const namespace = searchParams.get("namespace") || "workspaces";
  const [connected, setConnected] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1b26]">
      <div className="flex items-center justify-between px-3 py-1 bg-[#24283b] border-b border-gray-700 shrink-0">
        <span className="text-xs font-medium text-gray-200">
          Observe: {name} <span className="text-gray-500">({namespace})</span>
        </span>
        <span className="text-[11px] text-gray-500">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <SharedDisplay
          workspaceName={name}
          namespace={namespace}
          onConnectionChange={setConnected}
        />
      </div>
    </div>
  );
}
