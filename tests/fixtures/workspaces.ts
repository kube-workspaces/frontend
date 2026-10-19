import type { Workspace, WorkspaceImage } from "../../src/lib/api";

// Public-safe fixtures shared by component tests and install screenshots.
export const workspaces: Workspace[] = [
  { name: "code-studio", namespace: "demo", type: "container", image: "ghcr.io/example/code-studio:latest", ready_replicas: 1, stopped: false, cpu_request: "500m", cpu_limit: "2", memory_request: "1Gi", memory_limit: "4Gi", created_at: "2026-09-01T09:00:00Z" },
  { name: "linux-desktop", namespace: "demo", type: "container", image: "ghcr.io/example/linux-desktop:latest", ready_replicas: 1, stopped: false, created_at: "2026-09-02T09:00:00Z" },
  { name: "research-notebook", namespace: "demo", type: "container", image: "ghcr.io/example/notebook:latest", ready_replicas: 0, stopped: true, created_at: "2026-09-03T09:00:00Z" },
  { name: "ubuntu-vm", namespace: "demo", type: "vm", image: "ghcr.io/example/ubuntu-vm:latest", ready_replicas: 1, stopped: false, created_at: "2026-09-04T09:00:00Z" },
];

export const images: WorkspaceImage[] = [
  { cr_name: "code-studio", name: "Code Studio", image: workspaces[0].image, description: "A browser-based development environment", default_port: 8080, default_path: "/", category: "Development" },
  { cr_name: "linux-desktop", name: "Linux Desktop", image: workspaces[1].image, description: "A complete Linux desktop in your browser", default_port: 8080, default_path: "/", category: "Desktop" },
  { cr_name: "notebook", name: "Research Notebook", image: workspaces[2].image, description: "An interactive environment for data and discovery", default_port: 8888, default_path: "/lab", category: "Development" },
  { cr_name: "ubuntu-vm", name: "Ubuntu VM", image: workspaces[3].image, description: "A persistent virtual machine workspace", default_port: 22, category: "Virtual Machine", workspace_types: ["vm"] },
];
