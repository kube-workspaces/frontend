"use client";

import type { ContainerInitForm } from "@/lib/container-init-form";
import type { WorkspaceImage } from "@/lib/api";

export default function ContainerInitFields({ value, onChange, image, inputClass }: {
  value: ContainerInitForm; onChange: (value: ContainerInitForm) => void;
  image: WorkspaceImage | null; inputClass: string;
}) {
  const update = (patch: Partial<ContainerInitForm>) => onChange({ ...value, ...patch });
  const enabled = value.mode === "injected" || value.mode === "baked-in";
  return <fieldset className="space-y-3 rounded-md border border-gray-200 dark:border-gray-800 p-3">
    <legend className="text-xs font-medium">Container initialization</legend>
    <label className="block text-xs">Initialization mode
      <select value={value.mode} onChange={(e) => update({ mode: e.target.value as ContainerInitForm["mode"] })} className={inputClass}>
        <option value="inherit">Use image defaults ({image?.default_container_init?.mode || "disabled"})</option>
        <option value="disabled">Disabled</option>
        <option value="injected">Injected — provision before application startup</option>
        <option value="baked-in">Baked-in — deliver data to the image entrypoint</option>
      </select>
    </label>
    {value.mode === "inherit" && image?.default_container_init?.mode && image.default_container_init.mode !== "disabled" &&
      <p className="text-xs text-gray-500">The API will snapshot the image’s initialization mode and cloud-config when creating this workspace.</p>}
    {enabled && <>
      <label className="block text-xs">User-data source
        <select value={value.source} onChange={(e) => update({ source: e.target.value as ContainerInitForm["source"] })} className={inputClass}>
          <option value="catalog" disabled={!image?.default_user_data}>Image default cloud-config</option>
          <option value="inline">Inline cloud-config</option>
          <option value="secret">Existing Secret in this namespace</option>
        </select>
      </label>
      {value.source === "inline" && <label className="block text-xs">Cloud-config
        <textarea rows={9} value={value.userData} onChange={(e) => update({ userData: e.target.value })} className={`${inputClass} font-mono`} spellCheck={false} />
        <span className="text-gray-500">Inline data is stored in the Workspace CR. Use a Secret reference for private configuration.</span>
      </label>}
      {value.source === "secret" && <label className="block text-xs">User-data Secret name
        <input value={value.secret} onChange={(e) => update({ secret: e.target.value })} className={inputClass} placeholder="workspace-init" />
        <span className="text-gray-500">The Secret must exist in the workspace namespace and contain a user-data key.</span>
      </label>}
      {value.mode === "injected" ? <>
        <p className="text-xs text-gray-500">Runs in the main container, then executes the application argv. Setup requires the image’s account/package/trust tools and writable target paths.</p>
        <label className="block text-xs">Default account for SSH keys
          <input value={value.defaultUser} onChange={(e) => update({ defaultUser: e.target.value })} className={inputClass} placeholder="Optional explicit account" />
        </label>
        <label className="block text-xs">Application run-as account
          <input value={value.runAsUser} onChange={(e) => update({ runAsUser: e.target.value })} className={inputClass} placeholder="Optional non-root account after setup" />
          <span className="text-gray-500">Setup runs as the container identity. Dropping privileges requires root and an existing or provisioned non-root account.</span>
        </label>
      </> : <p className="text-xs text-gray-500">The image entrypoint must invoke container-init itself. Command and identity handling remain owned by that entrypoint.</p>}
    </>}
  </fieldset>;
}
