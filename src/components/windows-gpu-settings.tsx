"use client";

import { useEffect, useRef, useState } from "react";
import { setWorkspaceGPUProfile, Workspace } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import VMGPUProfileSelect from "@/components/vm-gpu-profile-select";

export default function WindowsGPUSettings({ workspace, onUpdated }: { workspace: Workspace; onUpdated: (workspace: Workspace) => void }) {
  const { user, authEnabled, loading } = useAuth();
  const [selected, setSelected] = useState(workspace.vm_gpu_profile?.id || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const editable = !loading && (!authEnabled || user?.role === "admin" || user?.role === "editor");
  return <section className="rounded-md border border-gray-200 p-3 text-xs dark:border-gray-800">
    <h2 className="font-medium">Windows graphics</h2>
    <p className="my-2 text-gray-500 dark:text-gray-400">Configured: {workspace.vm_gpu_profile?.display_name || "Software graphics"}{workspace.vm_gpu_profile?.experimental ? " (experimental)" : ""}. This is the requested hardware profile, not observed driver, rendering or encoder status.</p>
    {editable && <>
      <VMGPUProfileSelect value={selected} onChange={setSelected} current={workspace.vm_gpu_profile} disabled={!workspace.stopped || pending} />
      <p className="mt-2 text-gray-500 dark:text-gray-400">Stop the workspace and wait for its VM to finish shutting down before changing graphics. Root disk, EFI, TPM and workspace identity are retained.</p>
      {error && <p role="alert" className="mt-2 text-red-600 dark:text-red-400">{error}</p>}
      <button type="button" disabled={!workspace.stopped || pending || selected === (workspace.vm_gpu_profile?.id || "")}
        className="mt-2 text-[var(--color-primary)] disabled:opacity-50" onClick={async () => {
          setPending(true); setError("");
          try {
            const updated = await setWorkspaceGPUProfile(workspace.name, workspace.namespace, selected);
            if (alive.current) onUpdated(updated);
          } catch (err) {
            if (alive.current) setError(err instanceof Error ? err.message : "GPU profile change failed");
          } finally {
            if (alive.current) setPending(false);
          }
        }}>{pending ? "Saving…" : "Apply GPU profile"}</button>
    </>}
  </section>;
}
