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
        <div className="flex items-center justify-center h-dvh bg-[#1a1b26]">
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
  const [toolbarSlot, setToolbarSlot] = useState<HTMLSpanElement | null>(null);

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-[#1a1b26]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 bg-[#24283b] border-b border-gray-700 shrink-0">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-200">
          Observe: {name} <span className="text-gray-500">({namespace})</span>
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-gray-500">
          {connected ? "Connected" : "Disconnected"}
        </span>
        <span ref={setToolbarSlot} className="ml-auto inline-flex shrink-0 items-center gap-2" />
      </div>
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <SharedDisplay
          workspaceName={name}
          namespace={namespace}
          onConnectionChange={setConnected}
          toolbarSlot={toolbarSlot}
        />
      </div>
    </div>
  );
}
