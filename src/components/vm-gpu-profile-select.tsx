"use client";

import { useEffect, useId, useState } from "react";
import { listVMGPUProfiles, VMGPUProfile } from "@/lib/api";

export default function VMGPUProfileSelect({ value, onChange, disabled = false, current }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  current?: VMGPUProfile;
}) {
  const id = useId();
  const [profiles, setProfiles] = useState<VMGPUProfile[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await listVMGPUProfiles(controller.signal);
        if (!controller.signal.aborted) setProfiles(result);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "GPU profiles unavailable");
      }
    })();
    return () => controller.abort();
  }, []);
  const selected = profiles.find((profile) => profile.id === value) || (current?.id === value ? current : undefined);
  return <div className="space-y-1 text-xs">
    <label htmlFor={id} className="block font-medium">Windows GPU profile</label>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}
      className="block w-full rounded border border-gray-300 bg-white p-2 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950">
      <option value="">Software graphics</option>
      {value && !profiles.some((profile) => profile.id === value) && <option value={value}>{current?.display_name || value} (current)</option>}
      {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}{profile.experimental ? " — experimental" : ""}</option>)}
    </select>
    {selected && <p className="text-gray-500 dark:text-gray-400">{selected.count} × {selected.resource_name} ({selected.kind}); requires Windows driver {selected.guest_driver_version}. Worker eligibility and allocation are checked by the server. Driver installation and hardware encoding are separate.</p>}
    {error && <p role="status" className="text-gray-500 dark:text-gray-400">{error}. Software graphics remains available.</p>}
  </div>;
}
