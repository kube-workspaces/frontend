"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  createWorkspace,
  createVolume,
  listImages,
  listVolumes,
  listNamespaces,
  getPlatformConfig,
  WorkspaceImage,
  Volume,
  Namespace,
  EnvVar,
  Toleration,
  FormFieldLock,
} from "@/lib/api";
import { useNamespace } from "@/lib/namespace";

// Scheduling presets define common node affinity/toleration configurations
interface SchedulingPreset {
  name: string;
  description: string;
  tolerations: Toleration[];
  nodeSelector: Record<string, string>;
}

// An image supports a workspace type when its workspace_types list includes it;
// an empty list means container-only (the historical default).
function filterImagesByType(images: WorkspaceImage[], type: "container" | "vm" | "scratch"): WorkspaceImage[] {
  return images.filter((img) => {
    const types = img.workspace_types;
    if (!types || types.length === 0) return type === "container";
    return types.includes(type);
  });
}

const SCHEDULING_PRESETS: SchedulingPreset[] = [
  {
    name: "Default",
    description: "No special scheduling constraints",
    tolerations: [],
    nodeSelector: {},
  },
  {
    name: "GPU Node (NVIDIA)",
    description: "Schedule on nodes with NVIDIA GPUs",
    tolerations: [{ key: "nvidia.com/gpu", operator: "Exists", effect: "NoSchedule" }],
    nodeSelector: { "nvidia.com/gpu.present": "true" },
  },
  {
    name: "GPU Node (AMD)",
    description: "Schedule on nodes with AMD GPUs",
    tolerations: [{ key: "amd.com/gpu", operator: "Exists", effect: "NoSchedule" }],
    nodeSelector: { "amd.com/gpu.present": "true" },
  },
  {
    name: "High Memory",
    description: "Schedule on high-memory nodes",
    tolerations: [{ key: "node-role.kubernetes.io/high-memory", operator: "Exists", effect: "NoSchedule" }],
    nodeSelector: { "node.kubernetes.io/instance-type": "high-memory" },
  },
];

export default function NewWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      }
    >
      <NewWorkspaceForm />
    </Suspense>
  );
}

function NewWorkspaceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedImage = searchParams.get("image");
  const { namespace: contextNamespace } = useNamespace();
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [namespace, setNamespace] = useState("");
  const [workspaceType, setWorkspaceType] = useState<"container" | "vm" | "scratch">("container");
  const [selectedImage, setSelectedImage] = useState<WorkspaceImage | null>(null);
  const [cpuRequest, setCpuRequest] = useState("500m");
  const [memoryRequest, setMemoryRequest] = useState("512Mi");
  const [cpuLimit, setCpuLimit] = useState("2");
  const [memoryLimit, setMemoryLimit] = useState("2Gi");
  const [selectedVolumes, setSelectedVolumes] = useState<{ name: string; mountPath: string; isNew?: boolean; isAuto?: boolean; newSize?: string; newStorageClass?: string; newAccessMode?: string }[]>([]);

  // Environment variables
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);

  // Scheduling
  const [selectedPreset, setSelectedPreset] = useState<string>("Default");
  const [customTolerations, setCustomTolerations] = useState<Toleration[]>([]);
  const [customNodeSelector, setCustomNodeSelector] = useState<{ key: string; value: string }[]>([]);

  // GPU
  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [gpuCount, setGpuCount] = useState("1");
  const [gpuVendor, setGpuVendor] = useState("nvidia.com/gpu");

  // Shared memory
  const [shmEnabled, setShmEnabled] = useState(false);

  // Image pull policy
  const [imagePullPolicy, setImagePullPolicy] = useState("IfNotPresent");

  // Form field locks (admin-controlled)
  const [fieldLocks, setFieldLocks] = useState<FormFieldLock[]>([]);

  // Helper to check if a field is locked and get its enforced value
  const getFieldLock = (field: string): FormFieldLock | undefined =>
    fieldLocks.find((l) => l.field === field);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [imagesData, volumesData, namespacesData, platformConfig] = await Promise.all([
          listImages(),
          listVolumes(),
          listNamespaces(),
          getPlatformConfig(),
        ]);
        setImages(imagesData || []);
        setVolumes(volumesData || []);
        setNamespaces(namespacesData || []);
        if (platformConfig.formFieldLocks) {
          setFieldLocks(platformConfig.formFieldLocks);
        }

        // Set default namespace: prefer context selection, fall back to first available
        const activeNs = (namespacesData || []).filter((ns) => ns.phase === "Active");
        if (activeNs.length > 0) {
          const contextMatch = contextNamespace && activeNs.find((ns) => ns.name === contextNamespace);
          setNamespace(contextMatch ? contextNamespace : activeNs[0].name);
        }

        // Apply enforced values from field locks
        const locks = platformConfig.formFieldLocks || [];
        for (const lock of locks) {
          if (!lock.value) continue;
          switch (lock.field) {
            case "image_pull_policy": setImagePullPolicy(lock.value); break;
            case "shared_memory": setShmEnabled(lock.value === "true"); break;
            case "cpu_request": setCpuRequest(lock.value); break;
            case "memory_request": setMemoryRequest(lock.value); break;
            case "cpu_limit": setCpuLimit(lock.value); break;
            case "memory_limit": setMemoryLimit(lock.value); break;
          }
        }

        // Initial image selection respects the default (container) type filter
        if (imagesData && imagesData.length > 0) {
          const containerImages = filterImagesByType(imagesData, "container");
          const match = preselectedImage
            ? containerImages.find((img) => img.image === preselectedImage)
            : null;
          const initial = match || containerImages[0] || imagesData[0];
          setSelectedImage(initial);
          setSelectedVolumes((v) => applyHomeVolume(initial, "", v));
          setShmEnabled(initial.default_shared_memory ?? false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load form data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedImage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedImage || !name) return;

    setSubmitting(true);
    setError(null);

    try {
      const volumeMounts = await Promise.all(
        selectedVolumes.map(async (v) => {
          if (v.isNew && v.name) {
            await createVolume({
              name: v.name,
              namespace,
              size: v.newSize || "5Gi",
              storage_class: v.newStorageClass || undefined,
              access_mode: v.newAccessMode || "ReadWriteOnce",
            });
          }
          return { name: v.name, mount_path: v.mountPath };
        })
      );

      // Build tolerations from preset + custom
      const preset = SCHEDULING_PRESETS.find((p) => p.name === selectedPreset);
      const allTolerations = [
        ...(preset?.tolerations || []),
        ...customTolerations.filter((t) => t.key),
      ];

      // Build node selector from preset + custom
      const allNodeSelector: Record<string, string> = {
        ...(preset?.nodeSelector || {}),
      };
      for (const ns of customNodeSelector) {
        if (ns.key && ns.value) {
          allNodeSelector[ns.key] = ns.value;
        }
      }

      // Build env vars (filter empty entries)
      const filteredEnv = envVars.filter((e) => e.name);

      await createWorkspace({
        name,
        namespace,
        type: workspaceType,
        container: {
          name,
          image: selectedImage.image,
          port: selectedImage.default_port,
          cpu_request: cpuRequest,
          memory_request: memoryRequest,
          cpu_limit: cpuLimit,
          memory_limit: memoryLimit,
          ...(gpuEnabled && gpuCount ? { gpu_request: gpuCount, gpu_vendor: gpuVendor } : {}),
        },
        volume_mounts: workspaceType === "vm" ? [] : volumeMounts,
        ...(filteredEnv.length > 0 ? { env: filteredEnv } : {}),
        ...(allTolerations.length > 0 ? { tolerations: allTolerations } : {}),
        ...(Object.keys(allNodeSelector).length > 0 ? { node_selector: allNodeSelector } : {}),
        ...(shmEnabled ? { shared_memory: true } : {}),
        ...(imagePullPolicy !== "IfNotPresent" ? { image_pull_policy: imagePullPolicy } : {}),
      });
      router.push("/workspaces");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setSubmitting(false);
    }
  };

  const addVolume = (isNew: boolean) => {
    if (isNew) {
      setSelectedVolumes([...selectedVolumes, { name: "", mountPath: "/data", isNew: true, newSize: "5Gi", newStorageClass: "", newAccessMode: "ReadWriteOnce" }]);
    } else {
      setSelectedVolumes([...selectedVolumes, { name: "", mountPath: "/data" }]);
    }
  };

  const removeVolume = (index: number) => {
    setSelectedVolumes(selectedVolumes.filter((_, i) => i !== index));
  };

  const updateVolume = (index: number, field: "name" | "mountPath", value: string) => {
    const updated = [...selectedVolumes];
    updated[index][field] = value;
    setSelectedVolumes(updated);
  };

  const updateNewVol = (index: number, field: "newSize" | "newStorageClass" | "newAccessMode", value: string) => {
    const updated = [...selectedVolumes];
    updated[index][field] = value;
    setSelectedVolumes(updated);
  };

  const homeVolType = { name: "", mountPath: "", isNew: true, isAuto: true, newSize: "10Gi", newStorageClass: "", newAccessMode: "ReadWriteOnce" } as const;

  const applyHomeVolume = (img: WorkspaceImage | null, wsName: string, vols: typeof selectedVolumes) => {
    const autoIdx = vols.findIndex((v) => v.isAuto);
    if (img?.default_homedir) {
      const autoName = wsName ? `${wsName}-home` : "";
      if (autoIdx >= 0) {
        const updated = [...vols];
        updated[autoIdx] = { ...updated[autoIdx], name: autoName, mountPath: img.default_homedir };
        return updated;
      }
      return [...vols, { ...homeVolType, name: autoName, mountPath: img.default_homedir }];
    }
    if (autoIdx >= 0) {
      return vols.filter((_, i) => i !== autoIdx);
    }
    return vols;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const inputClass = "mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white px-3 py-2 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-muted)] outline-none transition-colors";
  const lockedInputClass = inputClass + " opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-900";

  // Helper function for lock badge rendering
  const renderLockBadge = (lock: FormFieldLock) => (
    <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 text-[9px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded" title={lock.message || "This field is locked by an administrator"}>
      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
      Locked
    </span>
  );

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Create New Workspace
      </h1>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3 mb-4">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
          <input type="text" id="name" value={name} onChange={(e) => { const v = e.target.value; setName(v); setSelectedVolumes((prev) => prev.map((vol) => vol.isAuto ? { ...vol, name: v ? `${v}-home` : "" } : vol)); }} pattern="^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$" maxLength={63} required placeholder="my-workspace" autoFocus className={inputClass} />
          <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">Lowercase letters, numbers, and hyphens only.</p>
        </div>

        <div>
          <label htmlFor="namespace" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Namespace</label>
          <select id="namespace" value={namespace} onChange={(e) => setNamespace(e.target.value)} className={inputClass}>
            {namespaces.filter((ns) => ns.phase === "Active").map((ns) => (
              <option key={ns.name} value={ns.name}>{ns.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Type</label>
          <div className="flex gap-1.5">
            {([
              { value: "container", label: "Container", desc: "StatefulSet" },
              { value: "vm", label: "Virtual Machine", desc: "KubeVirt" },
              { value: "scratch", label: "Scratch", desc: "Deployment" },
            ] as const).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setWorkspaceType(t.value);
                  // Re-pick the image from the newly-filtered list, keeping the
                  // current selection if it still applies.
                  const allowed = filterImagesByType(images, t.value);
                  setSelectedImage((cur) => (cur && allowed.find((i) => i.image === cur.image) ? cur : allowed[0] || null));
                }}
                className={`flex-1 px-2.5 py-2 rounded-md border text-left transition-colors ${
                  workspaceType === t.value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                <p className="text-xs font-medium text-gray-900 dark:text-white">{t.label}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Image</label>
          {(() => {
            // Group images by category (filtered to the selected workspace type)
            const grouped: Record<string, WorkspaceImage[]> = {};
            for (const img of filterImagesByType(images, workspaceType)) {
              const cat = img.category || "Other";
              if (!grouped[cat]) grouped[cat] = [];
              grouped[cat].push(img);
            }
            // Sort categories: named categories first (alphabetically), "Other" last
            const categories = Object.keys(grouped).sort((a, b) => {
              if (a === "Other") return 1;
              if (b === "Other") return -1;
              return a.localeCompare(b);
            });
            return (
              <div className="space-y-3">
                {categories.map((cat) => (
                  <div key={cat}>
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{cat}</p>
                    <div className="space-y-1.5">
                      {grouped[cat].map((img) => (
                        <label
                          key={img.image}
                          className={`flex items-center p-2.5 border rounded-md cursor-pointer transition-colors ${
                            selectedImage?.image === img.image
                              ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                              : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                          }`}
                        >
                          <input type="radio" name="image" value={img.image} checked={selectedImage?.image === img.image} onChange={() => { setSelectedImage(img); setSelectedVolumes((v) => applyHomeVolume(img, name, v)); setShmEnabled(img.default_shared_memory ?? false); }} className="sr-only" />
                          {img.icon && (
                            img.icon.trimStart().startsWith("<svg") ? (
                              <span className="w-6 h-6 mr-2.5 rounded flex-shrink-0 inline-flex items-center justify-center" dangerouslySetInnerHTML={{ __html: img.icon }} />
                            ) : (
                              <Image src={img.icon} alt="" width={24} height={24} className="w-6 h-6 mr-2.5 rounded flex-shrink-0" unoptimized onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            )
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{img.name}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">{img.image}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Resources</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cpuRequest" className="block text-[10px] text-gray-400 dark:text-gray-500">CPU Request{getFieldLock("cpu_request") && renderLockBadge(getFieldLock("cpu_request")!)}</label>
              <input type="text" id="cpuRequest" value={cpuRequest} onChange={(e) => setCpuRequest(e.target.value)} disabled={!!getFieldLock("cpu_request")} className={getFieldLock("cpu_request") ? lockedInputClass : inputClass} />
            </div>
            <div>
              <label htmlFor="memoryRequest" className="block text-[10px] text-gray-400 dark:text-gray-500">Memory Request{getFieldLock("memory_request") && renderLockBadge(getFieldLock("memory_request")!)}</label>
              <input type="text" id="memoryRequest" value={memoryRequest} onChange={(e) => setMemoryRequest(e.target.value)} disabled={!!getFieldLock("memory_request")} className={getFieldLock("memory_request") ? lockedInputClass : inputClass} />
            </div>
            <div>
              <label htmlFor="cpuLimit" className="block text-[10px] text-gray-400 dark:text-gray-500">CPU Limit{getFieldLock("cpu_limit") && renderLockBadge(getFieldLock("cpu_limit")!)}</label>
              <input type="text" id="cpuLimit" value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} disabled={!!getFieldLock("cpu_limit")} className={getFieldLock("cpu_limit") ? lockedInputClass : inputClass} />
            </div>
            <div>
              <label htmlFor="memoryLimit" className="block text-[10px] text-gray-400 dark:text-gray-500">Memory Limit{getFieldLock("memory_limit") && renderLockBadge(getFieldLock("memory_limit")!)}</label>
              <input type="text" id="memoryLimit" value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} disabled={!!getFieldLock("memory_limit")} className={getFieldLock("memory_limit") ? lockedInputClass : inputClass} />
            </div>
          </div>
        </div>

        {/* GPU Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">GPU{getFieldLock("gpu") && renderLockBadge(getFieldLock("gpu")!)}</label>
            <button
              type="button"
              onClick={() => !getFieldLock("gpu") && setGpuEnabled(!gpuEnabled)}
              disabled={!!getFieldLock("gpu")}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${gpuEnabled ? "bg-[var(--color-primary)]" : "bg-gray-200 dark:bg-gray-700"} ${getFieldLock("gpu") ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${gpuEnabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
            </button>
          </div>
          {gpuEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-gray-400 dark:text-gray-500">GPU Count</label>
                <select value={gpuCount} onChange={(e) => setGpuCount(e.target.value)} className={inputClass}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                  <option value="8">8</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 dark:text-gray-500">Vendor</label>
                <select value={gpuVendor} onChange={(e) => setGpuVendor(e.target.value)} className={inputClass}>
                  <option value="nvidia.com/gpu">NVIDIA</option>
                  <option value="amd.com/gpu">AMD</option>
                  <option value="intel.com/gpu">Intel</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Shared Memory Section (not applicable to VM workspaces) */}
        {workspaceType !== "vm" && (
        <div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Shared Memory (/dev/shm){getFieldLock("shared_memory") && renderLockBadge(getFieldLock("shared_memory")!)}</label>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Required for Chrome, Chromium, and ML frameworks (PyTorch DataLoader)</p>
            </div>
            <button
              type="button"
              onClick={() => !getFieldLock("shared_memory") && setShmEnabled(!shmEnabled)}
              disabled={!!getFieldLock("shared_memory")}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${shmEnabled ? "bg-[var(--color-primary)]" : "bg-gray-200 dark:bg-gray-700"} ${getFieldLock("shared_memory") ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${shmEnabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>
        )}

        {/* Image Pull Policy Section */}
        <div>
          <label htmlFor="imagePullPolicy" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Image Pull Policy{getFieldLock("image_pull_policy") && renderLockBadge(getFieldLock("image_pull_policy")!)}</label>
          <select
            id="imagePullPolicy"
            value={imagePullPolicy}
            onChange={(e) => setImagePullPolicy(e.target.value)}
            disabled={!!getFieldLock("image_pull_policy")}
            className={getFieldLock("image_pull_policy") ? lockedInputClass : inputClass}
          >
            <option value="IfNotPresent">IfNotPresent (use cached image if available)</option>
            <option value="Always">Always (pull image every time)</option>
            <option value="Never">Never (only use local image)</option>
          </select>
        </div>

        {/* Environment Variables Section */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Environment Variables</label>
            <button type="button" onClick={() => setEnvVars([...envVars, { name: "", value: "" }])} className="text-[10px] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
              + Add Variable
            </button>
          </div>
          {envVars.map((env, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <input
                type="text"
                value={env.name}
                onChange={(e) => { const updated = [...envVars]; updated[index] = { ...updated[index], name: e.target.value }; setEnvVars(updated); }}
                placeholder="NAME"
                className={inputClass + " flex-1"}
              />
              <input
                type="text"
                value={env.value}
                onChange={(e) => { const updated = [...envVars]; updated[index] = { ...updated[index], value: e.target.value }; setEnvVars(updated); }}
                placeholder="value"
                className={inputClass + " flex-1"}
              />
              <button type="button" onClick={() => setEnvVars(envVars.filter((_, i) => i !== index))} className="text-[10px] text-red-500 hover:text-red-700 px-1">
                &times;
              </button>
            </div>
          ))}
          {envVars.length === 0 && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">No custom environment variables. Image defaults still apply.</p>
          )}
        </div>

        {/* Scheduling Section */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Scheduling</label>
          <div>
            <label className="block text-[10px] text-gray-400 dark:text-gray-500">Preset</label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className={inputClass}
            >
              {SCHEDULING_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>{preset.name} &mdash; {preset.description}</option>
              ))}
              <option value="Custom">Custom</option>
            </select>
          </div>

          {selectedPreset === "Custom" && (
            <div className="mt-3 space-y-3">
              {/* Custom Tolerations */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-gray-400 dark:text-gray-500">Tolerations</label>
                  <button type="button" onClick={() => setCustomTolerations([...customTolerations, { key: "", operator: "Equal", value: "", effect: "NoSchedule" }])} className="text-[10px] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
                    + Add
                  </button>
                </div>
                {customTolerations.map((tol, index) => (
                  <div key={index} className="flex gap-1 mb-1">
                    <input
                      type="text"
                      value={tol.key}
                      onChange={(e) => { const updated = [...customTolerations]; updated[index] = { ...updated[index], key: e.target.value }; setCustomTolerations(updated); }}
                      placeholder="key"
                      className={inputClass + " flex-1 !text-[10px]"}
                    />
                    <select
                      value={tol.operator || "Equal"}
                      onChange={(e) => { const updated = [...customTolerations]; updated[index] = { ...updated[index], operator: e.target.value }; setCustomTolerations(updated); }}
                      className={inputClass + " w-20 !text-[10px]"}
                    >
                      <option value="Equal">Equal</option>
                      <option value="Exists">Exists</option>
                    </select>
                    <input
                      type="text"
                      value={tol.value || ""}
                      onChange={(e) => { const updated = [...customTolerations]; updated[index] = { ...updated[index], value: e.target.value }; setCustomTolerations(updated); }}
                      placeholder="value"
                      className={inputClass + " flex-1 !text-[10px]"}
                      disabled={tol.operator === "Exists"}
                    />
                    <select
                      value={tol.effect || "NoSchedule"}
                      onChange={(e) => { const updated = [...customTolerations]; updated[index] = { ...updated[index], effect: e.target.value }; setCustomTolerations(updated); }}
                      className={inputClass + " w-28 !text-[10px]"}
                    >
                      <option value="NoSchedule">NoSchedule</option>
                      <option value="PreferNoSchedule">PreferNoSchedule</option>
                      <option value="NoExecute">NoExecute</option>
                    </select>
                    <button type="button" onClick={() => setCustomTolerations(customTolerations.filter((_, i) => i !== index))} className="text-[10px] text-red-500 hover:text-red-700 px-1">
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {/* Custom Node Selector */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-gray-400 dark:text-gray-500">Node Selector</label>
                  <button type="button" onClick={() => setCustomNodeSelector([...customNodeSelector, { key: "", value: "" }])} className="text-[10px] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
                    + Add
                  </button>
                </div>
                {customNodeSelector.map((ns, index) => (
                  <div key={index} className="flex gap-2 mb-1">
                    <input
                      type="text"
                      value={ns.key}
                      onChange={(e) => { const updated = [...customNodeSelector]; updated[index] = { ...updated[index], key: e.target.value }; setCustomNodeSelector(updated); }}
                      placeholder="label-key"
                      className={inputClass + " flex-1 !text-[10px]"}
                    />
                    <input
                      type="text"
                      value={ns.value}
                      onChange={(e) => { const updated = [...customNodeSelector]; updated[index] = { ...updated[index], value: e.target.value }; setCustomNodeSelector(updated); }}
                      placeholder="label-value"
                      className={inputClass + " flex-1 !text-[10px]"}
                    />
                    <button type="button" onClick={() => setCustomNodeSelector(customNodeSelector.filter((_, i) => i !== index))} className="text-[10px] text-red-500 hover:text-red-700 px-1">
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Volumes (not applicable to VM workspaces — containerDisk root is ephemeral) */}
        {workspaceType !== "vm" && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Volumes</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => addVolume(false)} className="text-[10px] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
                + Existing
              </button>
              <span className="text-[10px] text-gray-300 dark:text-gray-700">|</span>
              <button type="button" onClick={() => addVolume(true)} className="text-[10px] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
                + New Volume
              </button>
            </div>
          </div>
          {selectedVolumes.map((vol, index) => (
            <div key={index} className="border border-gray-200 dark:border-gray-800 rounded-md p-3 mb-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                  {vol.isAuto ? "Home Volume" : vol.isNew ? "Additional Volume" : "Existing Volume"}
                </span>
                <button type="button" onClick={() => removeVolume(index)} className="text-[10px] text-red-500 hover:text-red-700">
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {vol.isNew ? (
                  <>
                    <div>
                      <label className="block text-[10px] text-gray-400 dark:text-gray-500">Name</label>
                      <input type="text" value={vol.name} onChange={(e) => updateVolume(index, "name", e.target.value)} pattern="^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$" maxLength={63} required placeholder="my-data" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 dark:text-gray-500">Size</label>
                      <select value={vol.newSize || "5Gi"} onChange={(e) => updateNewVol(index, "newSize", e.target.value)} className={inputClass}>
                        <option value="1Gi">1 GiB</option>
                        <option value="5Gi">5 GiB</option>
                        <option value="10Gi">10 GiB</option>
                        <option value="20Gi">20 GiB</option>
                        <option value="50Gi">50 GiB</option>
                        <option value="100Gi">100 GiB</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 dark:text-gray-500">Storage Class</label>
                      <input type="text" value={vol.newStorageClass || ""} onChange={(e) => updateNewVol(index, "newStorageClass", e.target.value)} placeholder="default" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 dark:text-gray-500">Access Mode</label>
                      <select value={vol.newAccessMode || "ReadWriteOnce"} onChange={(e) => updateNewVol(index, "newAccessMode", e.target.value)} className={inputClass}>
                        <option value="ReadWriteOnce">ReadWriteOnce</option>
                        <option value="ReadWriteMany">ReadWriteMany</option>
                        <option value="ReadOnlyMany">ReadOnlyMany</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <label className="block text-[10px] text-gray-400 dark:text-gray-500">PVC Name</label>
                    <select value={vol.name} onChange={(e) => updateVolume(index, "name", e.target.value)} className={inputClass}>
                      <option value="">Select...</option>
                      {volumes.map((v) => (
                        <option key={v.name} value={v.name}>{v.name} ({v.size})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={vol.isNew ? "col-span-2" : "col-span-2"}>
                  <label className="block text-[10px] text-gray-400 dark:text-gray-500">Mount Path</label>
                  <input type="text" value={vol.mountPath} onChange={(e) => updateVolume(index, "mountPath", e.target.value)} placeholder="/data" className={inputClass} />
                </div>
              </div>
            </div>
          ))}
          {selectedVolumes.length === 0 && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">No volumes attached.</p>
          )}
        </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => router.push("/workspaces")} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !name || !selectedImage} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? "Creating..." : "Create Workspace"}
          </button>
        </div>
      </form>
    </div>
  );
}
