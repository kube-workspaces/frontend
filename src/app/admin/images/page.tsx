"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { listImages, createImage, getImageCR, updateImage, deleteImage, WorkspaceImage, CreateImagePayload } from "@/lib/api";
import { stringify as yamlStringify } from "yaml";

export default function AdminImagesPage() {
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editImage, setEditImage] = useState<WorkspaceImage | null>(null);
  const [editCR, setEditCR] = useState<Record<string, unknown> | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteImageName, setDeleteImageName] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewYaml, setViewYaml] = useState<{ name: string; cr: Record<string, unknown> } | null>(null);

  const fetchImages = useCallback(async () => {
    try {
      const data = await listImages();
      setImages(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch images");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchImagesRef = useRef(fetchImages);
  useEffect(() => { fetchImagesRef.current = fetchImages; }, [fetchImages]);
  useEffect(() => { fetchImagesRef.current(); }, [fetchImages]);

  const handleEdit = async (img: WorkspaceImage) => {
    setEditImage(img);
    setEditLoading(true);
    try {
      const cr = await getImageCR(img.cr_name);
      setEditCR(cr as Record<string, unknown>);
    } catch {
      setEditCR(null);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteImageName) return;
    try {
      await deleteImage(deleteImageName);
      setDeleteImageName(null);
      fetchImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
    }
  };

  const handleImageCreated = () => {
    setShowAddModal(false);
    fetchImages();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading images...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Image Editor</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
        >
          + Add Image
        </button>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Display Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Image</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Port</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {images.map((img) => (
              <tr key={img.cr_name} className="hover:bg-gray-50 dark:hover:bg-white/5">
                <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white">{img.cr_name}</td>
                <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{img.name}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-gray-500 dark:text-gray-400 max-w-[300px] truncate">{img.image}</td>
                <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{img.default_port}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleEdit(img)}
                      className="px-2 py-1 text-[10px] font-medium rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteImageName(img.cr_name)}
                      className="px-2 py-1 text-[10px] font-medium rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const cr = await getImageCR(img.cr_name);
                          setViewYaml({ name: img.cr_name, cr: cr as Record<string, unknown> });
                        } catch {
                          setViewYaml({ name: img.cr_name, cr: { error: "Error loading CR" } });
                        }
                      }}
                      className="px-2 py-1 text-[10px] font-mono font-medium rounded text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="View raw YAML"
                    >
                      YAML
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editImage && (
        <EditImageModal
          image={editImage}
          cr={editCR}
          loading={editLoading}
          onClose={() => { setEditImage(null); setEditCR(null); }}
          onSaved={() => {
            setEditImage(null);
            setEditCR(null);
            fetchImages();
          }}
        />
      )}

      {deleteImageName && (
        <DeleteConfirmModal
          name={deleteImageName}
          onCancel={() => setDeleteImageName(null)}
          onConfirm={handleDelete}
        />
      )}

      {showAddModal && (
        <AddImageModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleImageCreated}
        />
      )}

      {viewYaml && (
        <YamlModal
          name={viewYaml.name}
          cr={viewYaml.cr}
          onClose={() => setViewYaml(null)}
        />
      )}
    </div>
  );
}

function EditImageModal({
  image,
  cr,
  loading,
  onClose,
  onSaved,
}: {
  image: WorkspaceImage;
  cr: Record<string, unknown> | null;
  loading: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFormDefaults = (useCr: Record<string, unknown> | null) => {
    const s = (useCr?.spec as Record<string, unknown>) || {};
    return {
      displayName: (s.displayName as string) || (image.name || ""),
      imgRef: (s.image as string) || (image.image || ""),
      description: (s.description as string) || (image.description || ""),
      port: String(s.defaultPort || image.default_port || "8080"),
      path: (s.defaultPath as string) || (image.default_path || ""),
      icon: (s.icon as string) || (image.icon || ""),
      privileged: Boolean(s.privileged || image.privileged),
      homepageUrl: (s.homepageURL as string) || (image.homepage_url || ""),
      sourceUrl: (s.sourceURL as string) || (image.source_url || ""),
      imageHomepageUrl: (s.imageHomepageURL as string) || (image.image_homepage_url || ""),
      defaultUser: (s.defaultUser as string) || (image.default_user || ""),
      defaultHomedir: (s.defaultHomedir as string) || (image.default_homedir || ""),
      defaultArgs: Array.isArray(s.defaultArgs) ? (s.defaultArgs as string[]).join(" ") : "",
      needsNoopSw: Boolean((s.proxyConfig as Record<string, unknown>)?.needsNoopSW || image.proxy_config?.needs_noop_sw),
      rewritePaths: Boolean((s.proxyConfig as Record<string, unknown>)?.rewriteHostAbsolutePaths || image.proxy_config?.rewrite_host_absolute_paths),
    };
  };

  const [form, setForm] = useState(getFormDefaults(null));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cr) setForm(getFormDefaults(cr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cr]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const newSpec: Record<string, unknown> = {
      image: form.imgRef,
      displayName: form.displayName,
      description: form.description,
      defaultPort: parseInt(form.port, 10),
      defaultPath: form.path,
      icon: form.icon,
      privileged: form.privileged,
      homepageURL: form.homepageUrl,
      sourceURL: form.sourceUrl,
      imageHomepageURL: form.imageHomepageUrl,
      defaultUser: form.defaultUser || undefined,
      defaultHomedir: form.defaultHomedir || undefined,
    };

    if (form.defaultArgs.trim()) {
      newSpec.defaultArgs = form.defaultArgs.trim().split(/\s+/);
    }
    if (form.needsNoopSw || form.rewritePaths) {
      newSpec.proxyConfig = {
        needsNoopSW: form.needsNoopSw,
        rewriteHostAbsolutePaths: form.rewritePaths,
      };
    }

    try {
      await updateImage(image.cr_name, newSpec);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update image");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500";

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading image data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Edit: {image.cr_name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-auto flex-1">
          {error && (
            <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-2">
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
            <input type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Image <span className="text-red-500">*</span></label>
            <input type="text" value={form.imgRef} onChange={(e) => setForm({ ...form, imgRef: e.target.value })} className={`${inputClass} font-mono`} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Port <span className="text-red-500">*</span></label>
              <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Path</label>
              <input type="text" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Icon</label>
              <input type="text" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Default Args</label>
            <input type="text" value={form.defaultArgs} onChange={(e) => setForm({ ...form, defaultArgs: e.target.value })} className={`${inputClass} font-mono`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Homepage URL</label>
              <input type="url" value={form.homepageUrl} onChange={(e) => setForm({ ...form, homepageUrl: e.target.value })} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Source URL</label>
              <input type="url" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} className={`${inputClass} font-mono`} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Image Registry URL</label>
            <input type="url" value={form.imageHomepageUrl} onChange={(e) => setForm({ ...form, imageHomepageUrl: e.target.value })} className={`${inputClass} font-mono`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Default User</label>
              <input type="text" value={form.defaultUser} onChange={(e) => setForm({ ...form, defaultUser: e.target.value })} placeholder="coder" className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Default Home Dir</label>
              <input type="text" value={form.defaultHomedir} onChange={(e) => setForm({ ...form, defaultHomedir: e.target.value })} placeholder="/home/coder" className={`${inputClass} font-mono`} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form.needsNoopSw} onChange={(e) => setForm({ ...form, needsNoopSw: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600" />
              No-op ServiceWorker
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form.rewritePaths} onChange={(e) => setForm({ ...form, rewritePaths: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600" />
              Rewrite Paths
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form.privileged} onChange={(e) => setForm({ ...form, privileged: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600" />
              Privileged
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.displayName || !form.imgRef || !form.port}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Delete Image</h3>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Are you sure you want to delete <strong>{name}</strong>? This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...obj };
  if (cleaned.metadata && typeof cleaned.metadata === "object") {
    const meta = { ...(cleaned.metadata as Record<string, unknown>) };
    delete meta.managedFields;
    delete meta.uid;
    delete meta.resourceVersion;
    delete meta.generation;
    delete meta.creationTimestamp;
    delete meta.ownerReferences;
    delete meta.generateName;
    cleaned.metadata = meta;
  }
  delete cleaned.status;
  return cleaned;
}

function YamlModal({ name, cr, onClose }: { name: string; cr: Record<string, unknown>; onClose: () => void }) {
  const [clean, setClean] = useState(true);
  const displayObj = clean ? cleanObject(cr) : cr;
  const yaml = yamlStringify(displayObj, { lineWidth: 120 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">{name}</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clean}
                onChange={(e) => setClean(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-[var(--color-primary)] focus:ring-[var(--color-primary-muted)] h-3.5 w-3.5"
              />
              Clean
            </label>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <pre className="p-4 overflow-auto text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre">{yaml}</pre>
      </div>
    </div>
  );
}

function AddImageModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [defaultPort, setDefaultPort] = useState("8080");
  const [defaultPath, setDefaultPath] = useState("/");
  const [icon, setIcon] = useState("");
  const [defaultArgs, setDefaultArgs] = useState("");
  const [needsNoopSw, setNeedsNoopSw] = useState(false);
  const [rewriteHostAbsolutePaths, setRewriteHostAbsolutePaths] = useState(false);
  const [privileged, setPrivileged] = useState(false);
  const [homepageUrl, setHomepageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageHomepageUrl, setImageHomepageUrl] = useState("");
  const [defaultUser, setDefaultUser] = useState("");
  const [defaultHomedir, setDefaultHomedir] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !image || !defaultPort) return;

    setSaving(true);
    setError(null);

    try {
      const payload: CreateImagePayload = {
        name,
        image,
        default_port: parseInt(defaultPort, 10),
      };
      if (description) payload.description = description;
      if (defaultPath) payload.default_path = defaultPath;
      if (icon) payload.icon = icon;
      if (defaultArgs.trim()) {
        payload.default_args = defaultArgs.trim().split(/\s+/);
      }
      if (needsNoopSw || rewriteHostAbsolutePaths) {
        payload.proxy_config = {
          needs_noop_sw: needsNoopSw,
          rewrite_host_absolute_paths: rewriteHostAbsolutePaths,
        };
      }
      if (privileged) payload.privileged = true;
      if (homepageUrl) payload.homepage_url = homepageUrl;
      if (sourceUrl) payload.source_url = sourceUrl;
      if (imageHomepageUrl) payload.image_homepage_url = imageHomepageUrl;
      if (defaultUser) payload.default_user = defaultUser;
      if (defaultHomedir) payload.default_homedir = defaultHomedir;

      await createImage(payload);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create image");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Add Image</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-auto flex-1">
          {error && (
            <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-2">
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Code Server (VS Code)" className={inputClass} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Image <span className="text-red-500">*</span></label>
            <input type="text" value={image} onChange={(e) => setImage(e.target.value)} placeholder="codercom/code-server:latest" className={`${inputClass} font-mono`} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Browser-based VS Code experience" className={inputClass} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Port <span className="text-red-500">*</span></label>
              <input type="number" value={defaultPort} onChange={(e) => setDefaultPort(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Path</label>
              <input type="text" value={defaultPath} onChange={(e) => setDefaultPath(e.target.value)} placeholder="/" className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Icon</label>
              <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="emoji, SVG, or icon URL" className={inputClass} />
              <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Text, inline SVG, or https:// URL</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Default Args</label>
            <input type="text" value={defaultArgs} onChange={(e) => setDefaultArgs(e.target.value)} placeholder="--bind-addr 0.0.0.0:8080 --auth none" className={`${inputClass} font-mono`} />
            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Space-separated arguments</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Homepage URL</label>
              <input type="url" value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} placeholder="https://github.com/..." className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Source URL</label>
              <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://github.com/..." className={`${inputClass} font-mono`} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Image Registry URL</label>
            <input type="url" value={imageHomepageUrl} onChange={(e) => setImageHomepageUrl(e.target.value)} placeholder="https://hub.docker.com/r/..." className={`${inputClass} font-mono`} />
            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Link to the container image on Docker Hub or other registry</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Default User</label>
              <input type="text" value={defaultUser} onChange={(e) => setDefaultUser(e.target.value)} placeholder="coder" className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Default Home Dir</label>
              <input type="text" value={defaultHomedir} onChange={(e) => setDefaultHomedir(e.target.value)} placeholder="/home/coder" className={`${inputClass} font-mono`} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={needsNoopSw} onChange={(e) => setNeedsNoopSw(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
              No-op ServiceWorker
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={rewriteHostAbsolutePaths} onChange={(e) => setRewriteHostAbsolutePaths(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
              Rewrite Paths
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={privileged} onChange={(e) => setPrivileged(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
              Privileged
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name || !image || !defaultPort} className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Creating..." : "Create Image"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
