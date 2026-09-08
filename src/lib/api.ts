// API_BASE: In production, all API calls go through /api prefix (nginx rewrites /api/* → /*)
// For local dev, set NEXT_PUBLIC_API_URL=http://localhost:8090 to hit the API directly.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? (process.env.NEXT_PUBLIC_API_URL).replace(/\/+$/, "")
  : "/api";

// Extract a meaningful error message from a failed response.
// HTTP/2 does not transmit statusText, so we read the body as fallback.
async function apiError(res: Response, prefix: string): Promise<Error> {
  let detail = res.statusText;
  if (!detail) {
    const body = await res.text().catch(() => "");
    detail = body || String(res.status);
  }
  return new Error(`${prefix}: ${detail}`);
}

// getProxyUrl builds the URL to access a workspace app via the reverse proxy.
// All proxy traffic goes through the main host: /proxy/{namespace}/{name}/{path}
// The kw-session cookie is sent automatically (same domain).
export function getProxyUrl(namespace: string, name: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `/proxy/${namespace}/${name}/${cleanPath}`;
}

export interface Workspace {
  name: string;
  namespace: string;
  type: WorkspaceType;
  image: string;
  port?: number;
  cpu_request?: string;
  memory_request?: string;
  cpu_limit?: string;
  memory_limit?: string;
  ready_replicas: number;
  container_state?: ContainerState;
  conditions?: WorkspaceCondition[];
  stopped: boolean;
  created_at?: string;
  volume_mounts?: VolumeMount[];
}

export interface ContainerState {
  state?: string;
  reason?: string;
  message?: string;
  started_at?: string;
}

export interface WorkspaceCondition {
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
  last_transition_time?: string;
}

export interface VolumeMount {
  name: string;
  mount_path: string;
}

export type WorkspaceType = "container" | "vm" | "scratch";

export interface CreateWorkspacePayload {
  name: string;
  namespace: string;
  type?: WorkspaceType;
  container: {
    name: string;
    image: string;
    port: number;
    cpu_request: string;
    memory_request: string;
    cpu_limit: string;
    memory_limit: string;
    gpu_request?: string;
    gpu_vendor?: string;
  };
  volume_mounts?: VolumeMount[];
  env?: EnvVar[];
  tolerations?: Toleration[];
  node_selector?: Record<string, string>;
  shared_memory?: boolean;
  image_pull_policy?: string;
}

export interface EnvVar {
  name: string;
  value: string;
}

export interface Toleration {
  key: string;
  operator?: string;
  value?: string;
  effect?: string;
}

export interface UpdateWorkspacePayload {
  image?: string;
  port?: number;
  cpu_request?: string;
  memory_request?: string;
  cpu_limit?: string;
  memory_limit?: string;
  volume_mounts?: VolumeMount[];
}

export interface Volume {
  name: string;
  namespace: string;
  size: string;
  storage_class?: string;
  access_mode?: string;
  phase: string;
  created_at?: string;
  labels?: Record<string, string>;
}

export interface CreateVolumePayload {
  name: string;
  namespace: string;
  size: string;
  storage_class?: string;
  access_mode: string;
}

export interface ImageProxyConfig {
  needs_noop_sw?: boolean;
  websocket_paths?: string[];
  rewrite_host_absolute_paths?: boolean;
  custom_request_headers?: Record<string, string>;
  inject_base_tag?: boolean;
  preserve_path_prefix?: boolean;
}

export interface WorkspaceImage {
  cr_name: string;
  name: string;
  image: string;
  description?: string;
  category?: string;
  tags?: string[];
  default_port: number;
  default_path?: string;
  default_shell?: string;
  proxy_config?: ImageProxyConfig;
  icon?: string;
  privileged?: boolean;
  homepage_url?: string;
  source_url?: string;
  image_homepage_url?: string;
  default_user?: string;
  default_password?: string;
  default_cloud_init?: boolean;
  default_user_data?: string;
  default_homedir?: string;
  default_shared_memory?: boolean;
  workspace_types?: string[];
  links?: ImageLink[];
  default_credentials?: ImageCredentials;
}

export interface ImageLink {
  title: string;
  url: string;
}

export interface ImageCredentials {
  username?: string;
  password?: string;
}

export interface ImageEnvVar {
  name: string;
  value: string;
}

export interface CreateImagePayload {
  name: string;
  image: string;
  description?: string;
  default_port: number;
  default_path?: string;
  icon?: string;
  default_args?: string[];
  default_env?: ImageEnvVar[];
  privileged?: boolean;
  homepage_url?: string;
  source_url?: string;
  image_homepage_url?: string;
  default_user?: string;
  default_password?: string;
  default_cloud_init?: boolean;
  default_user_data?: string;
  default_homedir?: string;
  links?: ImageLink[];
  default_credentials?: ImageCredentials;
  proxy_config?: ImageProxyConfig;
}

export interface Namespace {
  name: string;
  phase: string;
  created_at?: string;
}

// Workspace API
export async function listWorkspaces(namespace: string = "_all"): Promise<Workspace[]> {
  const res = await fetch(`${API_BASE}/v1/workspaces?namespace=${namespace}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to list workspaces");
  return res.json();
}

export async function getWorkspace(name: string, namespace: string = "workspaces"): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/v1/workspaces/${name}?namespace=${namespace}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to get workspace");
  return res.json();
}

export async function createWorkspace(payload: CreateWorkspacePayload): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create workspace: ${error}`);
  }
  return res.json();
}

export async function updateWorkspace(name: string, payload: UpdateWorkspacePayload, namespace: string = "workspaces"): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/v1/workspaces/${name}?namespace=${namespace}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to update workspace: ${error}`);
  }
  return res.json();
}

export async function deleteWorkspace(name: string, namespace: string = "workspaces"): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/workspaces/${name}?namespace=${namespace}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw await apiError(res, "Failed to delete workspace");
  }
}

export async function startWorkspace(name: string, namespace: string = "workspaces"): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/v1/workspaces/${name}/start?namespace=${namespace}`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw await apiError(res, "Failed to start workspace");
  }
  return res.json();
}

export async function stopWorkspace(name: string, namespace: string = "workspaces"): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/v1/workspaces/${name}/stop?namespace=${namespace}`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw await apiError(res, "Failed to stop workspace");
  }
  return res.json();
}

export async function resetWorkspace(name: string, namespace: string = "workspaces"): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/v1/workspaces/${name}/reset?namespace=${namespace}`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw await apiError(res, "Failed to reset workspace");
  }
  return res.json();
}

// Volume API
export async function listVolumes(namespace: string = "_all"): Promise<Volume[]> {
  const res = await fetch(`${API_BASE}/v1/volumes?namespace=${namespace}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to list volumes");
  return res.json();
}

export async function getVolume(name: string, namespace: string = "workspaces"): Promise<Volume> {
  const res = await fetch(`${API_BASE}/v1/volumes/${name}?namespace=${namespace}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to get volume");
  return res.json();
}

export async function createVolume(payload: CreateVolumePayload): Promise<Volume> {
  const res = await fetch(`${API_BASE}/v1/volumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create volume: ${error}`);
  }
  return res.json();
}

export async function deleteVolume(name: string, namespace: string = "workspaces"): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/volumes/${name}?namespace=${namespace}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to delete volume");
}

// Images API
export async function listImages(): Promise<WorkspaceImage[]> {
  const res = await fetch(`${API_BASE}/v1/images`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to list images");
  return res.json();
}

export async function createImage(payload: CreateImagePayload): Promise<WorkspaceImage> {
  const res = await fetch(`${API_BASE}/v1/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create image: ${res.statusText || res.status}`);
  }
  return res.json();
}

export async function updateImage(name: string, spec: Record<string, unknown>): Promise<object> {
  const res = await fetch(`${API_BASE}/admin/crds/images/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to update image: ${res.statusText || res.status}`);
  }
  return res.json();
}

export async function deleteImage(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/crds/images/${name}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to delete image");
}

// Namespaces API
export async function listNamespaces(): Promise<Namespace[]> {
  const res = await fetch(`${API_BASE}/v1/namespaces`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to list namespaces");
  return res.json();
}

// Workspace Logs API
export async function getWorkspaceLogs(
  name: string,
  namespace: string = "workspaces",
  tail: number = 500
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/v1/workspaces/${name}/logs?namespace=${namespace}&tail=${tail}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) throw await apiError(res, "Failed to get workspace logs");
  const data = await res.json();
  return data.logs || "";
}

// Workspace Events API
export interface WorkspaceEvent {
  type: string;
  reason: string;
  message: string;
  object: string;
  first_seen?: string;
  last_seen?: string;
  count: number;
  source?: string;
}

export interface PodInfo {
  metadata?: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    uid?: string;
    labels?: Record<string, string>;
  };
  spec?: {
    nodeName?: string;
    restartPolicy?: string;
    serviceAccountName?: string;
    containers?: Array<{
      name: string;
      image: string;
      resources?: {
        requests?: Record<string, string>;
        limits?: Record<string, string>;
      };
    }>;
  };
  status?: {
    phase: string;
    podIP?: string;
    hostIP?: string;
    qosClass?: string;
    startTime?: string;
    conditions?: PodCondition[];
    containerStatuses?: ContainerStatus[];
    reason?: string;
    message?: string;
  };
}

export interface PodCondition {
  type: string;
  status: string;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

export interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  started?: boolean;
  image: string;
  imageID?: string;
  containerID?: string;
  state?: ContainerStateDetail;
  lastState?: ContainerLastState;
}

export interface ContainerStateDetail {
  running?: { startedAt?: string };
  waiting?: { reason?: string; message?: string };
  terminated?: {
    exitCode: number;
    signal?: number;
    reason?: string;
    message?: string;
    startedAt?: string;
    finishedAt?: string;
  };
}

export interface ContainerLastState {
  terminated?: {
    exitCode: number;
    reason?: string;
    message?: string;
    startedAt?: string;
    finishedAt?: string;
  };
}

export async function getWorkspaceEvents(
  name: string,
  namespace: string = "workspaces"
): Promise<WorkspaceEvent[]> {
  const res = await fetch(
    `${API_BASE}/v1/workspaces/${name}/events?namespace=${namespace}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) throw await apiError(res, "Failed to get workspace events");
  return res.json();
}

// Workspace Pod YAML API
export async function getWorkspacePod(
  name: string,
  namespace: string = "workspaces"
): Promise<PodInfo> {
  const res = await fetch(
    `${API_BASE}/v1/workspaces/${name}/pod?namespace=${namespace}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) throw await apiError(res, "Failed to get workspace pod");
  return res.json();
}

// Workspace Metrics API
export interface PodMetricPoint {
  timestamp: string;
  cpu_mc: number;
  memory_bytes: number;
}

export interface PodMetricsResponse {
  container: string;
  points: PodMetricPoint[];
  message?: string;
}

export async function getWorkspaceMetrics(
  name: string,
  namespace: string = "workspaces",
  window: string = "1h"
): Promise<PodMetricsResponse> {
  const res = await fetch(
    `${API_BASE}/v1/workspaces/${name}/metrics?namespace=${namespace}&window=${window}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to get metrics: ${res.statusText || res.status}`);
  }
  return res.json();
}

// Workspace CR YAML API (via admin endpoint)
export async function getWorkspaceCR(
  name: string,
  namespace: string = "workspaces"
): Promise<object> {
  const res = await fetch(
    `${API_BASE}/admin/crds/workspaces/${name}?namespace=${namespace}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) throw await apiError(res, "Failed to get workspace CR");
  return res.json();
}

// Image CR YAML API (via admin endpoint)
export async function getImageCR(name: string): Promise<object> {
  const res = await fetch(
    `${API_BASE}/admin/crds/images/${name}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) throw await apiError(res, "Failed to get image CR");
  return res.json();
}

// CRD Definition API
export interface CRDDefinition {
  metadata?: {
    name: string;
    creationTimestamp: string;
    uid: string;
    [key: string]: unknown;
  };
  name?: string;
  group?: string;
  kind?: string;
  plural?: string;
  scope?: string;
  versions?: Array<{
    name: string;
    served: boolean;
    storage: boolean;
    schema?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  spec?: {
    group: string;
    names: {
      kind: string;
      listKind: string;
      plural: string;
      singular: string;
      shortNames?: string[];
    };
    scope: string;
    versions: Array<{
      name: string;
      served: boolean;
      storage: boolean;
      schema?: Record<string, unknown>;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  status?: {
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
    }>;
    [key: string]: unknown;
  };
}

export interface CRDList {
  items: CRDDefinition[];
}

export async function listCRDDefinitions(): Promise<CRDDefinition[]> {
  const res = await fetch(`${API_BASE}/admin/crds/definitions`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to list CRDs");
  const data: CRDList = await res.json();
  return data.items || [];
}

export async function getCRDDefinition(name: string): Promise<CRDDefinition> {
  const res = await fetch(`${API_BASE}/admin/crds/definitions/${name}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await apiError(res, "Failed to get CRD");
  return res.json();
}

export interface CRDInstanceList {
  items: Record<string, unknown>[];
}

export async function listCRDInstances(
  group: string,
  version: string,
  resource: string,
  namespace?: string
): Promise<Record<string, unknown>[]> {
  let url = `${API_BASE}/admin/crds/instances/${group}/${version}/${resource}`;
  if (namespace) url += `?namespace=${namespace}`;
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  if (!res.ok) throw await apiError(res, "Failed to list instances");
  const data: CRDInstanceList = await res.json();
  return data.items || [];
}

// Form Field Locks
export interface FormFieldLock {
  field: string;
  value?: string;
  message?: string;
}

export interface AuthConfigPublic {
  enabled: boolean;
}

export async function getAuthConfig(): Promise<AuthConfigPublic> {
  const res = await fetch(`${API_BASE}/auth/config`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return { enabled: false };
  return res.json();
}

// Platform Configuration
export interface MaintenanceConfig {
  enabled: boolean;
  message?: string;
}

export interface PlatformConfigPublic {
  maintenance: MaintenanceConfig;
  formFieldLocks?: FormFieldLock[];
}

export async function getPlatformConfig(): Promise<PlatformConfigPublic> {
  const res = await fetch(`${API_BASE}/platform/config`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return { maintenance: { enabled: false } };
  return res.json();
}
