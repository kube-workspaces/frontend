"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { listWorkspaces, listVolumes, listImages, Workspace, Volume, WorkspaceImage } from "@/lib/api";
import { useNamespace } from "@/lib/namespace";

export default function Home() {
  const { namespace } = useNamespace();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const ns = namespace || "_all";
      const [ws, vol, img] = await Promise.all([
        listWorkspaces(ns),
        listVolumes(ns),
        listImages(),
      ]);
      const allVolumes = vol || [];

      const usedNames = new Set<string>();
      for (const w of ws || []) {
        for (const vm of w.volume_mounts || []) {
          usedNames.add(vm.name);
        }
      }

      setWorkspaces(ws || []);
      setVolumes(allVolumes.filter((v) => usedNames.has(v.name)));
      setImages(img || []);
    } catch {
      // silently fail on dashboard
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    fetchDataRef.current();
    const interval = setInterval(() => fetchDataRef.current(), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const runningCount = workspaces.filter((w) => w.ready_replicas > 0 && !w.stopped).length;
  const boundVolumes = volumes.filter((v) => v.phase === "Bound").length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/workspaces" className="border border-gray-200 dark:border-gray-800 rounded-md p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-[var(--color-primary-subtle)]">
              <svg className="w-5 h-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25m11.142 0l4.179 2.25L12 22.5l-9.75-5.25 4.179-2.25" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "-" : workspaces.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Workspaces</div>
            </div>
          </div>
        </Link>

        <Link href="/workspaces?running=true" className="border border-gray-200 dark:border-gray-800 rounded-md p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-green-50 dark:bg-green-900/30">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 15.828a4 4 0 010-5.656m5.656 0a4 4 0 010 5.656M12 12h.008v.008H12V12z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "-" : runningCount}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Running</div>
            </div>
          </div>
        </Link>

        <Link href="/volumes" className="border border-gray-200 dark:border-gray-800 rounded-md p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-purple-50 dark:bg-purple-900/30">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "-" : volumes.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Volumes</div>
            </div>
          </div>
        </Link>

        <Link href="/images" className="border border-gray-200 dark:border-gray-800 rounded-md p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-900/30">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? "-" : images.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Images</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Workspace status breakdown */}
      {!loading && workspaces.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-md">
          <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Workspaces</span>
            <Link href="/workspaces/new" className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
              + New
            </Link>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {workspaces.map((ws) => (
              <Link
                key={ws.name}
                href={`/workspaces/${ws.name}?namespace=${ws.namespace}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    ws.stopped ? "bg-gray-300 dark:bg-gray-600" :
                    ws.ready_replicas > 0 ? "bg-green-500" :
                    ws.container_state?.state === "waiting" && ws.container_state?.reason && ["Pending", "Unschedulable", "CreateContainerConfigError", "ImagePullBackOff", "CrashLoopBackOff"].includes(ws.container_state.reason) ? "bg-red-500" : "bg-amber-500"
                  }`} />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{ws.name}</span>
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-mono">
                      {ws.image.split("/").pop()}
                    </span>
                  </div>
                </div>
                <span className={`text-xs ${
                  ws.container_state?.state === "waiting" && ws.container_state?.reason && ["Pending", "Unschedulable", "CreateContainerConfigError", "ImagePullBackOff", "CrashLoopBackOff"].includes(ws.container_state.reason)
                    ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500"
                }`}>
                  {ws.stopped ? "Stopped" : ws.ready_replicas > 0 ? "Running" : ws.container_state?.reason || "Starting"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}



      {/* Volumes summary */}
      {!loading && volumes.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-md">
          <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Volumes</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{boundVolumes} bound</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {volumes.map((vol) => (
              <div key={vol.name} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
                  </svg>
                  <span className="text-sm text-gray-900 dark:text-white">{vol.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                  <span>{vol.size}</span>
                  <span className={vol.phase === "Bound" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>
                    {vol.phase}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
