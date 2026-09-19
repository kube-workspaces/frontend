"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";
import SharedDisplay from "@/components/shared-display";

export default function SharedDisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-[#1a1b26]">
          <span className="text-gray-400 text-sm">Connecting...</span>
        </div>
      }
    >
      <SharedDisplayContent />
    </Suspense>
  );
}

function SharedDisplayContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const name = params.name as string;
  const namespace = searchParams.get("namespace") || "workspaces";
  const [connected, setConnected] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1b26]">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#24283b] border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/workspaces/${name}?namespace=${namespace}`}
            className="text-xs text-gray-400 hover:text-gray-200 underline"
          >
            ← Back
          </Link>
          <span className="text-sm font-medium text-gray-200">{name}</span>
          <span className="text-xs text-gray-500">({namespace})</span>
        </div>
        <span className="text-xs text-gray-500">
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