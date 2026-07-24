"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { listImages, listWorkspaces, getImageCR, WorkspaceImage, Workspace } from "@/lib/api";
import { stringify as yamlStringify } from "yaml";

export default function ImageDetailPage() {
  const params = useParams();
  const name = params.name as string;

  const [image, setImage] = useState<WorkspaceImage | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonFormat, setJsonFormat] = useState<"json" | "yaml">("json");
  const [jsonView, setJsonView] = useState<"api" | "cr">("api");
  const [crData, setCrData] = useState<object | null>(null);
  const [crError, setCrError] = useState<string | null>(null);
  const [crLoading, setCrLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [imgs, ws] = await Promise.all([listImages(), listWorkspaces()]);
      const found = (imgs || []).find((i) => i.cr_name === name);
      setImage(found || null);
      setWorkspaces(ws || []);
      setError(found ? null : "Image not found");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch image");
    } finally {
      setLoading(false);
    }
  }, [name]);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    fetchDataRef.current();
  }, [fetchData]);

  const handleShowJson = () => {
    setShowJson(true);
    setCrData(null);
    setCrError(null);
    setCrLoading(true);
    getImageCR(name)
      .then((cr) => setCrData(cr))
      .catch((err) => setCrError(err instanceof Error ? err.message : "Failed to load CR"))
      .finally(() => setCrLoading(false));
  };

  const running = workspaces.filter(
    (ws) => image && ws.image === image.image && !ws.stopped && ws.ready_replicas > 0
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading image...</div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">{error || "Image not found."}</p>
        <Link href="/images" className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] mt-2 inline-block">
          Back to images
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {image.icon && <IconBadge icon={image.icon} size={40} />}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{image.name}</h1>
              {image.privileged && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  privileged
                </span>
              )}
            </div>
            {image.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{image.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={`/workspaces/new?image=${encodeURIComponent(image.image)}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Launch Workspace
          </Link>
          <button
            onClick={handleShowJson}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="font-mono text-[10px]">&lt;/&gt;</span>
            JSON
          </button>
        </div>
      </div>

      {error && error !== "Image not found" && (
        <div className="border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Info grid */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-md p-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 text-sm">
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Container Image</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white font-mono text-xs break-all">{image.image}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">CR Name</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white font-mono text-xs">{image.cr_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Port</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-white">{image.default_port}</dd>
          </div>
          {image.default_path && (
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Default Path</dt>
              <dd className="mt-0.5 text-gray-900 dark:text-white font-mono text-xs">{image.default_path}</dd>
            </div>
          )}

          {/* Proxy config */}
          {image.proxy_config && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Proxy Config</dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {image.proxy_config.needs_noop_sw && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-medium">
                    no-op ServiceWorker
                  </span>
                )}
                {image.proxy_config.rewrite_host_absolute_paths && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-[10px] font-medium">
                    rewrite host absolute paths
                  </span>
                )}
                {image.proxy_config.inject_base_tag && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[10px] font-medium">
                    inject base tag
                  </span>
                )}
                {image.proxy_config.websocket_paths && image.proxy_config.websocket_paths.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px] font-medium">
                      WebSocket paths:
                    </span>
                    {image.proxy_config.websocket_paths.map((p) => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] font-mono">
                        {p}
                      </span>
                    ))}
                  </div>
                )}
                {image.proxy_config.custom_request_headers && Object.keys(image.proxy_config.custom_request_headers).length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px] font-medium">
                      Custom headers:
                    </span>
                    {Object.entries(image.proxy_config.custom_request_headers).map(([k, v]) => (
                      <span key={k} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] font-mono">
                        {k}: {v}
                      </span>
                    ))}
                  </div>
                )}
              </dd>
            </div>
          )}

          {/* Default credentials */}
          {image.default_credentials && (image.default_credentials.username || image.default_credentials.password) && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Default Credentials</dt>
              <dd className="mt-1.5 flex items-center gap-2 text-xs font-mono text-gray-700 dark:text-gray-300">
                {image.default_credentials.username && <span>{image.default_credentials.username}</span>}
                {image.default_credentials.password && (
                  <span className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    {image.default_credentials.password}
                  </span>
                )}
              </dd>
            </div>
          )}

          {(image.default_user || image.default_homedir) && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Default User / Home</dt>
              <dd className="mt-1.5 flex items-center gap-2 text-xs font-mono text-gray-700 dark:text-gray-300">
                {image.default_user && <span>{image.default_user}</span>}
                {image.default_user && image.default_homedir && <span className="text-gray-400 dark:text-gray-500">@</span>}
                {image.default_homedir && <span>{image.default_homedir}</span>}
              </dd>
            </div>
          )}

          {/* Links */}
          {(image.homepage_url || image.source_url || image.image_homepage_url || (image.links && image.links.length > 0)) && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Links</dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {image.homepage_url && (
                  <a
                    href={image.homepage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                    </svg>
                    Homepage
                  </a>
                )}
                {image.image_homepage_url && (
                  <a
                    href={image.image_homepage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4.932 9.866h1.43v1.43H4.932zm0-1.614h1.43v1.43H4.932zm1.795-1.614h1.43v1.43H6.727zm0-1.614h1.43v1.43H6.727zm1.795-1.614h1.43v1.43H8.522zm0-1.614h1.43v1.43H8.522zm1.795 0h1.43v1.43H10.317zm0-1.614h1.43v1.43H10.317zm1.796 0h1.43v1.43H12.113zm0-1.614h1.43v1.43H12.113zm1.795 0h1.43v1.43H13.908zm0-1.614h1.43v1.43H13.908zm1.795 0h1.43v1.43H15.703zm0-1.614h1.43v1.43H15.703zm1.795 1.614h1.43v1.43H17.498zm0 1.614h1.43v1.43H17.498zm0-1.614h1.43v1.43H17.498zm1.795 0h1.43v1.43H19.293zm-16.779 3.27h1.795v1.43H2.514zm1.795 1.614h1.43v1.43H4.309zm1.795 0h1.43v1.43H6.104zm1.795 0h1.43v1.43H7.899zm1.796 0h1.43v1.43H9.695zm1.795 0h1.43v1.43H11.49zm1.795 0h1.43v1.43H13.285zm1.795 0h1.43v1.43H15.08zm1.795 0h1.43v1.43H16.875zm1.795 0h1.43v1.43H18.67zm1.795 0h1.43v1.43H20.465zm0-1.614h1.43v1.43H20.465zm-18.574-1.614h1.43v1.43H1.891zm1.795 0h1.43v1.43H3.686zm1.795 0h1.43v1.43H5.481zm1.795 0h1.43v1.43H7.276zm1.795 0h1.43v1.43H9.071zm1.795 0h1.43v1.43H10.866zm1.795 0h1.43v1.43H12.661zm1.795 0h1.43v1.43H14.456zm1.795 0h1.43v1.43H16.251zm1.795 0h1.43v1.43H18.046zm1.795 0h1.43v1.43H19.841zm0-1.614h1.43v1.43H19.841zm1.795 1.614h1.43v1.43H21.636zm-1.795-3.27h1.43v1.43H19.841z"/>
                    </svg>
                    Registry
                  </a>
                )}
                {image.source_url && (
                  <a
                    href={image.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <SourceIcon url={image.source_url} />
                    Source
                  </a>
                )}
                {image.links?.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    {link.title}
                  </a>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Running workspaces */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-md p-4">
        <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
          Running Workspaces ({running.length})
        </h2>
        {running.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No running workspaces using this image.</p>
        ) : (
          <div className="space-y-1.5">
            {running.map((ws) => (
              <Link
                key={`${ws.namespace}/${ws.name}`}
                href={`/workspaces/${ws.name}?namespace=${ws.namespace}`}
                className="flex items-center justify-between px-3 py-2 rounded-md border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400" />
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{ws.name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{ws.namespace}</span>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {ws.ready_replicas} replica{ws.ready_replicas !== 1 ? "s" : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* JSON modal */}
      {showJson && (
        <JsonModal
          image={image}
          format={jsonFormat}
          onFormatChange={setJsonFormat}
          view={jsonView}
          onViewChange={setJsonView}
          cr={crData}
          crError={crError}
          crLoading={crLoading}
          onClose={() => setShowJson(false)}
        />
      )}
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
      : yamlStringify(image);

  const crDisplay = cr && clean ? cleanObject(cr as Record<string, unknown>) : cr;
  const crContent =
    view === "cr"
      ? crLoading
        ? "Loading..."
        : crError
          ? crError
          : crDisplay
            ? (format === "json" ? JSON.stringify(crDisplay, null, 2) : yamlStringify(crDisplay))
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

function SourceIcon({ url }: { url: string }) {
  if (url.includes("github.com")) return GITHUB_ICON;
  if (url.includes("gitlab.com")) return GITLAB_ICON;
  return GENERIC_SOURCE_ICON;
}
