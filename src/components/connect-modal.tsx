"use client";

import { useEffect, useId, useState } from "react";

interface ConnectModalProps {
  workspaceName: string;
  namespace: string;
  url: string;
  onClose: () => void;
}

const closeIcon = "M6 18L18 6M6 6l12 12";
const openIcon = "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25";

function WindowControl({ title, path, onClick }: { title: string; path: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-1.5 text-gray-400 hover:text-gray-200 rounded transition-colors ${title.startsWith("Close") ? "hover:bg-red-600/80" : "hover:bg-gray-700"}`}
      title={title}
      aria-label={title}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </button>
  );
}

export default function ConnectModal({ workspaceName, namespace, url, onClose }: ConnectModalProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDocked, setIsDocked] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.ctrlKey) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const openInNewTab = () => {
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${isDocked ? "bg-transparent pointer-events-none" : "bg-black/60"}`}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isMaximized && !isDocked) onClose();
      }}
    >
      <div
        role="dialog"
        aria-hidden={isDocked || undefined}
        aria-modal={isDocked ? undefined : true}
        aria-labelledby={titleId}
        className={`${isDocked ? "invisible pointer-events-none" : ""} bg-[#1a1b26] border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden ${isMaximized ? "fixed inset-0 rounded-none border-0" : "w-[90vw] h-[80vh] max-w-6xl"}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-[#24283b] border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span id={titleId} className="text-sm font-medium text-gray-200 truncate">Connect: {workspaceName}</span>
            <span className="text-xs text-gray-500 truncate">({namespace})</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <WindowControl
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={() => setIsMaximized(!isMaximized)}
              path={isMaximized
                ? "M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                : "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"}
            />
            <WindowControl title="Minimize" onClick={() => setIsDocked(true)} path="M3.75 15.75h16.5M3.75 12h16.5" />
            <WindowControl title="Open in new tab" onClick={openInNewTab} path={openIcon} />
            <WindowControl title="Close (Ctrl+Esc)" onClick={onClose} path={closeIcon} />
          </div>
        </div>
        {/* Keep the app mounted while docked so its navigation and session survive. */}
        <iframe
          src={url}
          title={`Workspace app: ${workspaceName}`}
          className="flex-1 min-h-0 w-full border-0 bg-white"
          allow="fullscreen; clipboard-read; clipboard-write"
        />
      </div>
      {isDocked && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#24283b] border-t border-gray-700 pointer-events-auto flex items-center justify-between gap-2 px-4 py-1.5 text-xs text-gray-400">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-gray-200 font-medium truncate">Connect: {workspaceName}</span>
            <span className="text-gray-500 truncate">({namespace})</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <WindowControl title="Raise (restore)" onClick={() => setIsDocked(false)} path="M4.5 12.75l7.5-7.5 7.5 7.5m0-0l-7.5 7.5m7.5-7.5H4.5" />
            <WindowControl title="Open in new tab" onClick={openInNewTab} path={openIcon} />
            <WindowControl title="Close (Ctrl+Esc)" onClick={onClose} path={closeIcon} />
          </div>
        </div>
      )}
    </div>
  );
}
