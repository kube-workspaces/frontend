"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listImages, createImage, getImageCR, listWorkspaces, WorkspaceImage, CreateImagePayload, Workspace } from "@/lib/api";
import yaml from "yaml";

type ViewMode = "tiles" | "list" | "compact";

const viewIcons: Record<ViewMode, string> = {
  tiles: "\u25A6",
  list: "\u2261",
  compact: "\u2B1F",
};

export default function ImagesPage() {
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("tiles");
  const [modalImage, setModalImage] = useState<WorkspaceImage | null>(null);
  const [modalFormat, setModalFormat] = useState<"json" | "yaml">("json");
  const [modalView, setModalView] = useState<"api" | "cr">("api");
  const [modalCR, setModalCR] = useState<object | null>(null);
  const [modalCRError, setModalCRError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("images-category-filter") || "";
    }
    return "";
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("images-tags-filter");
      if (stored) {
        try { return JSON.parse(stored); } catch { return []; }
      }
    }
    return [];
  });

  const updateCategory = (cat: string) => {
    setSelectedCategory(cat);
    localStorage.setItem("images-category-filter", cat);
  };
  const updateTags = (tags: string[]) => {
    setSelectedTags(tags);
    localStorage.setItem("images-tags-filter", JSON.stringify(tags));
  };

  const fetchImages = useCallback(async () => {
    try {
      const [imgData, wsData] = await Promise.all([listImages(), listWorkspaces()]);
      setImages(imgData || []);
      setWorkspaces(wsData || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch images");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchImagesRef = useRef(fetchImages);
  useEffect(() => {
    fetchImagesRef.current = fetchImages;
  }, [fetchImages]);

  useEffect(() => {
    fetchImagesRef.current();
    const interval = setInterval(() => fetchImagesRef.current(), 15000);
    return () => clearInterval(interval);
  }, []);

  const handleShowJson = (img: WorkspaceImage) => {
    setModalImage(img);
    setModalView("api");
    setModalCR(null);
    setModalCRError(null);
    setModalLoading(true);
    getImageCR(img.cr_name)
      .then((cr) => setModalCR(cr))
      .catch((err) => setModalCRError(err instanceof Error ? err.message : "Failed to load CR"))
      .finally(() => setModalLoading(false));
  };

  const handleImageCreated = () => {
    setShowAddModal(false);
    fetchImages();
  };

  // Compute available categories and tags from loaded images
  const categories = Array.from(new Set(images.map(img => img.category || "Other").filter(Boolean))).sort();
  const allTags = Array.from(new Set(images.flatMap(img => img.tags || []))).sort();

  const filteredImages = images.filter((img) => {
    // Category filter
    if (selectedCategory && (img.category || "Other") !== selectedCategory) return false;
    // Tag filter (all selected tags must be present)
    if (selectedTags.length > 0) {
      const imgTags = img.tags || [];
      if (!selectedTags.every(t => imgTags.includes(t))) return false;
    }
    // Text search
    if (search) {
      const q = search.toLowerCase();
      return (
        img.name.toLowerCase().includes(q) ||
        img.image.toLowerCase().includes(q) ||
        (img.description && img.description.toLowerCase().includes(q)) ||
        (img.category && img.category.toLowerCase().includes(q)) ||
        (img.tags && img.tags.some(t => t.toLowerCase().includes(q)))
      );
    }
    return true;
  });

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
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          Available Images
        </h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search images..."
            className="px-2.5 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500 w-48"
          />
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
          >
            + Add Image
          </button>
          <div className="flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-gray-700 p-0.5">
            {(["tiles", "list", "compact"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-1 text-xs rounded ${
                  viewMode === mode
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
                title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
              >
                {viewIcons[mode]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Category and tag filters */}
      {(categories.length > 1 || allTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {categories.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Category:</span>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => updateCategory("")}
                  className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                    selectedCategory === ""
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => updateCategory(selectedCategory === cat ? "" : cat)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      selectedCategory === cat
                        ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Tags:</span>
              <div className="flex flex-wrap gap-1">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => updateTags(
                      selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]
                    )}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      selectedTags.includes(tag)
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(selectedCategory || selectedTags.length > 0) && (
            <button
              onClick={() => { updateCategory(""); updateTags([]); }}
              className="px-2 py-0.5 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filteredImages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">{search || selectedCategory || selectedTags.length > 0 ? "No images match your filters." : "No images available."}</p>
          {!search && !selectedCategory && selectedTags.length === 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-3 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
            >
              + Add Image
            </button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {filteredImages.map((img) => (
            <ImageListRow key={img.image} img={img} onShowJson={handleShowJson} />
          ))}
        </div>
      ) : viewMode === "compact" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {filteredImages.map((img) => (
            <ImageCompactCard key={img.image} img={img} onShowJson={handleShowJson} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredImages.map((img) => (
            <ImageTileCard key={img.image} img={img} workspaces={workspaces} onShowJson={handleShowJson} />
          ))}
        </div>
      )}

      {modalImage && (
        <JsonModal
          image={modalImage}
          format={modalFormat}
          onFormatChange={setModalFormat}
          view={modalView}
          onViewChange={setModalView}
          cr={modalCR}
          crError={modalCRError}
          crLoading={modalLoading}
          onClose={() => setModalImage(null)}
        />
      )}

      {showAddModal && (
        <AddImageModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleImageCreated}
        />
      )}
    </div>
  );
}

function AddImageModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
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
      if (privileged) {
        payload.privileged = true;
      }
      if (homepageUrl) payload.homepage_url = homepageUrl;
      if (sourceUrl) payload.source_url = sourceUrl;
      if (imageHomepageUrl) payload.image_homepage_url = imageHomepageUrl;

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Add Image
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
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
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Code Server (VS Code)"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Image <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="codercom/code-server:latest"
              className={`${inputClass} font-mono`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Browser-based VS Code experience"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Port <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={defaultPort}
                onChange={(e) => setDefaultPort(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Path
              </label>
              <input
                type="text"
                value={defaultPath}
                onChange={(e) => setDefaultPath(e.target.value)}
                placeholder="/"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Icon
              </label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="emoji, SVG, or icon URL"
                className={inputClass}
              />
              <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Text, inline SVG, or https:// URL</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Default Args
            </label>
            <input
              type="text"
              value={defaultArgs}
              onChange={(e) => setDefaultArgs(e.target.value)}
              placeholder="--bind-addr 0.0.0.0:8080 --auth none"
              className={`${inputClass} font-mono`}
            />
            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Space-separated arguments</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Homepage URL
              </label>
              <input
                type="url"
                value={homepageUrl}
                onChange={(e) => setHomepageUrl(e.target.value)}
                placeholder="https://github.com/..."
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Source URL
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://github.com/..."
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Image Registry URL
            </label>
            <input
              type="url"
              value={imageHomepageUrl}
              onChange={(e) => setImageHomepageUrl(e.target.value)}
              placeholder="https://hub.docker.com/r/..."
              className={`${inputClass} font-mono`}
            />
            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Link to the container image on Docker Hub or other registry</p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={needsNoopSw}
                onChange={(e) => setNeedsNoopSw(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              No-op ServiceWorker
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={rewriteHostAbsolutePaths}
                onChange={(e) => setRewriteHostAbsolutePaths(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Rewrite Paths
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={privileged}
                onChange={(e) => setPrivileged(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
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
              type="submit"
              disabled={saving || !name || !image || !defaultPort}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Creating..." : "Create Image"}
            </button>
          </div>
        </form>
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

function JsonModal({
  image,
  format,
  onFormatChange,
  view,
  onViewChange,
  cr,
  crError,
  crLoading,
  onClose,
}: {
  image: WorkspaceImage;
  format: "json" | "yaml";
  onFormatChange: (f: "json" | "yaml") => void;
  view: "api" | "cr";
  onViewChange: (v: "api" | "cr") => void;
  cr: object | null;
  crError: string | null;
  crLoading: boolean;
  onClose: () => void;
}) {
  const [clean, setClean] = useState(true);

  const apiContent =
    format === "json"
      ? JSON.stringify(image, null, 2)
      : yaml.stringify(image);

  const crDisplay = cr && clean ? cleanObject(cr as Record<string, unknown>) : cr;
  const crContent =
    view === "cr"
      ? crLoading
        ? "Loading..."
        : crError
          ? crError
          : crDisplay
            ? (format === "json" ? JSON.stringify(crDisplay, null, 2) : yaml.stringify(crDisplay))
            : "No CR data"
      : "";

  const content = view === "api" ? apiContent : crContent;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            {image.name}
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded border border-gray-200 dark:border-gray-700 p-0.5">
              {(["api", "cr"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onViewChange(v)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                    view === v
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {v === "api" ? "API" : "CR"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 rounded border border-gray-200 dark:border-gray-700 p-0.5">
              {(["json", "yaml"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => onFormatChange(f)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                    format === f
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            {view === "cr" && (
              <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clean}
                  onChange={(e) => setClean(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-[var(--color-primary)] focus:ring-[var(--color-primary-muted)] w-3 h-3"
                />
                Clean
              </label>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <pre className="p-4 overflow-auto text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre">
          {content}
        </pre>
      </div>
    </div>
  );
}

function LaunchLink({ image }: { image: string }) {
  return (
    <Link
      href={`/workspaces/new?image=${encodeURIComponent(image)}`}
      onClick={(e) => e.stopPropagation()}
      className="text-gray-400 hover:text-[var(--color-primary)] transition-colors"
      title="Create workspace with this image"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </Link>
  );
}

function ShowJsonButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute bottom-2 right-2 px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      title="Show raw image object"
    >
      &lt;/&gt;
    </button>
  );
}

function IconBadge({ icon, size = 12, className = "" }: { icon: string; size?: number; className?: string }) {
  const isSvg = icon.trimStart().startsWith("<svg");
  const isUrl = icon.startsWith("http://") || icon.startsWith("https://");
  const px = Math.round(size * 0.25);
  const padClass = `p-[${px}px]`;

  if (isSvg) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded bg-gray-100 dark:bg-gray-800 ${padClass} ${className}`}
        dangerouslySetInnerHTML={{ __html: icon }}
        style={{ width: size, height: size }}
      />
    );
  }

  if (isUrl) {
    return (
      <span className={`inline-flex items-center justify-center rounded bg-gray-100 dark:bg-gray-800 ${padClass} ${className}`} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={size} height={size} style={{ width: 'auto', height: 'auto', maxWidth: size, maxHeight: size }} />
      </span>
    );
  }

  return (
    <span className={`px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 ${className}`} style={{ fontSize: size * 0.75 }}>
      {icon}
    </span>
  );
}

const HOME_ICON = (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

const GITHUB_ICON = (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const GITLAB_ICON = (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
    <path d="M23.955 13.587l-1.342-4.135-2.664-8.189c-.169-.534-.922-.534-1.091 0l-2.664 8.189h-8.527l-2.665-8.189c-.169-.534-.922-.534-1.091 0l-2.664 8.189-1.342 4.135c-.093.291.057.608.341.7l10.444 3.71c.085.03.177.045.268.045s.183-.015.268-.045l10.444-3.71c.284-.092.434-.409.341-.7z"/>
  </svg>
);

const GENERIC_SOURCE_ICON = (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const DOCKER_ICON = (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
    <path d="M4.932 9.866h1.43v1.43H4.932zm0-1.614h1.43v1.43H4.932zm1.795-1.614h1.43v1.43H6.727zm0-1.614h1.43v1.43H6.727zm1.795-1.614h1.43v1.43H8.522zm0-1.614h1.43v1.43H8.522zm1.795 0h1.43v1.43H10.317zm0-1.614h1.43v1.43H10.317zm1.796 0h1.43v1.43H12.113zm0-1.614h1.43v1.43H12.113zm1.795 0h1.43v1.43H13.908zm0-1.614h1.43v1.43H13.908zm1.795 0h1.43v1.43H15.703zm0-1.614h1.43v1.43H15.703zm1.795 1.614h1.43v1.43H17.498zm0 1.614h1.43v1.43H17.498zm0-1.614h1.43v1.43H17.498zm1.795 0h1.43v1.43H19.293zm-16.779 3.27h1.795v1.43H2.514zm1.795 1.614h1.43v1.43H4.309zm1.795 0h1.43v1.43H6.104zm1.795 0h1.43v1.43H7.899zm1.796 0h1.43v1.43H9.695zm1.795 0h1.43v1.43H11.49zm1.795 0h1.43v1.43H13.285zm1.795 0h1.43v1.43H15.08zm1.795 0h1.43v1.43H16.875zm1.795 0h1.43v1.43H18.67zm1.795 0h1.43v1.43H20.465zm0-1.614h1.43v1.43H20.465zm-18.574-1.614h1.43v1.43H1.891zm1.795 0h1.43v1.43H3.686zm1.795 0h1.43v1.43H5.481zm1.795 0h1.43v1.43H7.276zm1.795 0h1.43v1.43H9.071zm1.795 0h1.43v1.43H10.866zm1.795 0h1.43v1.43H12.661zm1.795 0h1.43v1.43H14.456zm1.795 0h1.43v1.43H16.251zm1.795 0h1.43v1.43H18.046zm1.795 0h1.43v1.43H19.841zm0-1.614h1.43v1.43H19.841zm1.795 1.614h1.43v1.43H21.636zm-1.795-3.27h1.43v1.43H19.841z"/>
  </svg>
);

function SourceIcon({ url }: { url: string }) {
  if (url.includes("github.com")) return GITHUB_ICON;
  if (url.includes("gitlab.com")) return GITLAB_ICON;
  return GENERIC_SOURCE_ICON;
}

function ImageTileCard({
  img,
  workspaces,
  onShowJson,
}: {
  img: WorkspaceImage;
  workspaces: Workspace[];
  onShowJson: (img: WorkspaceImage) => void;
}) {
  const router = useRouter();
  const running = workspaces.filter((ws) => ws.image === img.image && !ws.stopped && ws.ready_replicas > 0);
  return (
    <div
      onClick={() => router.push(`/images/${img.cr_name}`)}
      className="relative border border-gray-200 dark:border-gray-800 rounded-md p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex flex-col h-full cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/images/${img.cr_name}`} onClick={(e) => e.stopPropagation()} className="text-sm font-medium text-gray-900 dark:text-white hover:text-[var(--color-primary)] transition-colors">
            {img.name}
          </Link>
          {img.description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {img.description}
            </p>
          )}
        </div>
        {img.icon && <IconBadge icon={img.icon} size={36} />}
      </div>
      <dl className="mt-3 space-y-1.5 text-xs flex-1">
        <div>
          <dt className="font-medium text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wide">Image</dt>
          <dd className="mt-0.5 font-mono text-gray-700 dark:text-gray-300 break-all">{img.image}</dd>
        </div>
        <div className="flex gap-4">
          <div>
            <dt className="font-medium text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wide">Port</dt>
            <dd className="mt-0.5 text-gray-700 dark:text-gray-300">{img.default_port}</dd>
          </div>
          {img.default_path && (
            <div>
              <dt className="font-medium text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wide">Path</dt>
              <dd className="mt-0.5 font-mono text-gray-700 dark:text-gray-300">{img.default_path}</dd>
            </div>
          )}
        </div>
        {img.proxy_config && (
          <div className="pt-1">
            <dt className="font-medium text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wide">Proxy Config</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {img.proxy_config.needs_noop_sw && (
                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-medium">
                  no-op SW
                </span>
              )}
              {img.proxy_config.rewrite_host_absolute_paths && (
                <span className="px-1.5 py-0.5 rounded bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-[10px] font-medium">
                  path rewrite
                </span>
              )}
              {img.proxy_config.inject_base_tag && (
                <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[10px] font-medium">
                  base tag
                </span>
              )}
              {img.privileged && (
                <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] font-medium">
                  privileged
                </span>
              )}
              {img.proxy_config.websocket_paths && img.proxy_config.websocket_paths.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px] font-mono">
                  WS: {img.proxy_config.websocket_paths.join(", ")}
                </span>
              )}
            </dd>
          </div>
        )}
        {(img.homepage_url || img.source_url || img.image_homepage_url || (img.links && img.links.length > 0)) && (
          <div className="pt-1">
            <dt className="font-medium text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wide">Links</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {img.homepage_url && (
                <a href={img.homepage_url} target="_blank" rel="noopener noreferrer" title="Homepage" onClick={(e) => e.stopPropagation()} className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {HOME_ICON}
                </a>
              )}
              {img.source_url && (
                <a href={img.source_url} target="_blank" rel="noopener noreferrer" title="Source" onClick={(e) => e.stopPropagation()} className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <SourceIcon url={img.source_url} />
                </a>
              )}
              {img.image_homepage_url && (
                <a href={img.image_homepage_url} target="_blank" rel="noopener noreferrer" title="Registry" onClick={(e) => e.stopPropagation()} className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {DOCKER_ICON}
                </a>
              )}
              {img.links?.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {link.title}
                </a>
              ))}
            </dd>
          </div>
        )}
        {img.default_credentials && (img.default_credentials.username || img.default_credentials.password) && (
          <div className="pt-1">
            <dt className="font-medium text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wide">Default Credentials</dt>
            <dd className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-gray-700 dark:text-gray-300">
              {img.default_credentials.username && (
                <span>{img.default_credentials.username}</span>
              )}
              {img.default_credentials.password && (
                <span className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {img.default_credentials.password}
                </span>
              )}
            </dd>
          </div>
        )}
        {(img.default_user || img.default_homedir) && (
          <div className="pt-1">
            <dt className="font-medium text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wide">Default User / Home</dt>
            <dd className="mt-0.5 text-[10px] font-mono text-gray-700 dark:text-gray-300">
              {img.default_user}{img.default_user && img.default_homedir && <span className="text-gray-400 dark:text-gray-500"> @ </span>}{img.default_homedir}
            </dd>
          </div>
        )}
        {running.length > 0 && (
          <div className="pt-1">
            <dt className="font-medium text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wide">Running Workspaces</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {running.map((ws) => (
                <Link
                  key={`${ws.namespace}/${ws.name}`}
                  href={`/workspaces/${ws.name}?namespace=${ws.namespace}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400" />
                  {ws.name}
                </Link>
              ))}
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={(e) => { e.stopPropagation(); onShowJson(img); }}
          className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="Show raw image object"
        >
          &lt;/&gt;
        </button>
        <Link
          href={`/workspaces/new?image=${encodeURIComponent(img.image)}`}
          onClick={(e) => e.stopPropagation()}
          className="px-2.5 py-1 text-[10px] font-medium rounded bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
        >
          Launch
        </Link>
      </div>
    </div>
  );
}

function ImageListRow({
  img,
  onShowJson,
}: {
  img: WorkspaceImage;
  onShowJson: (img: WorkspaceImage) => void;
}) {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push(`/images/${img.cr_name}`)}
      className="relative border border-gray-200 dark:border-gray-800 rounded-md px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/images/${img.cr_name}`} onClick={(e) => e.stopPropagation()} className="text-sm font-medium text-gray-900 dark:text-white hover:text-[var(--color-primary)] transition-colors truncate">
              {img.name}
            </Link>
            {img.icon && <IconBadge icon={img.icon} className="text-[10px]" />}
          </div>
          {img.description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
              {img.description}
            </p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <span className="font-mono">{img.image}</span>
          <span>:{img.default_port}</span>
          {img.default_path && <span className="font-mono">{img.default_path}</span>}
        </div>
        <LaunchLink image={img.image} />
        <ShowJsonButton onClick={() => onShowJson(img)} />
      </div>
    </div>
  );
}

function ImageCompactCard({
  img,
  onShowJson,
}: {
  img: WorkspaceImage;
  onShowJson: (img: WorkspaceImage) => void;
}) {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push(`/images/${img.cr_name}`)}
      className="relative border border-gray-200 dark:border-gray-800 rounded-md p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <Link href={`/images/${img.cr_name}`} onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-gray-900 dark:text-white hover:text-[var(--color-primary)] transition-colors truncate pr-1">
          {img.name}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          {img.icon && <IconBadge icon={img.icon} className="text-[10px]" />}
          <LaunchLink image={img.image} />
        </div>
      </div>
      <p className="mt-1 text-[10px] font-mono text-gray-500 dark:text-gray-400 truncate">
        {img.image}
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
        <span>:{img.default_port}</span>
        {img.default_path && <span className="font-mono truncate">{img.default_path}</span>}
      </div>
      <ShowJsonButton onClick={() => onShowJson(img)} />
    </div>
  );
}
