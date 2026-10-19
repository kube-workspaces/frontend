import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import WorkspacesPage from "@/app/workspaces/page";
import WorkspaceDetailPage from "@/app/workspaces/[name]/page";
import { workspaces } from "../fixtures/workspaces";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams("namespace=demo"),
  useParams: () => ({ name: "code-studio" }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  watchWorkspaces: vi.fn(), listImages: vi.fn(), getWorkspace: vi.fn(),
  getWorkspacePod: vi.fn(), getWorkspaceCR: vi.fn(), startWorkspace: vi.fn(),
  stopWorkspace: vi.fn(), listWorkspaces: vi.fn(),
}));

let snapshot: (items: api.Workspace[]) => void;
let watchError: (error: Error) => void;
const unsubscribe = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.watchWorkspaces).mockImplementation((_ns, onSnapshot, onError) => {
    snapshot = onSnapshot;
    watchError = onError;
    return unsubscribe;
  });
  vi.mocked(api.listImages).mockResolvedValue([]);
  vi.mocked(api.getWorkspacePod).mockRejectedValue(new Error("Pod not found"));
  vi.mocked(api.getWorkspaceCR).mockResolvedValue({});
  vi.mocked(api.getWorkspace).mockResolvedValue(workspaces[0]);
  vi.mocked(api.listWorkspaces).mockResolvedValue(workspaces);
});

describe("workspace list", () => {
  it("loads, renders an empty snapshot, and unsubscribes on unmount", async () => {
    const view = render(<WorkspacesPage />);
    expect(screen.getByText("Loading workspaces...")).toBeInTheDocument();
    act(() => snapshot([]));
    expect(screen.getByText("No workspaces found. Create one to get started.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Workspace" })).toHaveAttribute("href", "/workspaces/new");
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("surfaces a watch failure without claiming the inventory is empty, then recovers", async () => {
    render(<WorkspacesPage />);
    act(() => watchError(new Error("Workspace inventory unavailable")));
    expect(screen.getByText("Workspace inventory unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/No workspaces found/)).not.toBeInTheDocument();
    act(() => snapshot(workspaces));
    expect(screen.queryByText("Workspace inventory unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("code-studio")).toBeInTheDocument();
  });

  it("filters delivered snapshots and navigates with the workspace namespace", async () => {
    render(<WorkspacesPage />);
    act(() => snapshot(workspaces));
    fireEvent.change(screen.getByPlaceholderText("Search workspaces..."), { target: { value: "research" } });
    expect(screen.queryByText("code-studio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("row", { name: /research-notebook/ }));
    expect(navigation.push).toHaveBeenCalledWith("/workspaces/research-notebook?namespace=demo");
    fireEvent.change(screen.getByPlaceholderText("Search workspaces..."), { target: { value: "absent" } });
    expect(screen.getByText("No workspaces match the current filter.")).toBeInTheDocument();
  });
});

describe("workspace detail", () => {
  it("renders loading followed by the selected workspace and its proxy link", async () => {
    render(<WorkspaceDetailPage />);
    expect(screen.getByText("Loading workspace...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "code-studio" })).toBeInTheDocument();
    expect(api.getWorkspace).toHaveBeenCalledWith("code-studio", "demo");
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute("href", "/proxy/demo/code-studio/");
  });

  it("displays the request error instead of misreporting every failure as not found", async () => {
    vi.mocked(api.getWorkspace).mockRejectedValueOnce(new Error("Failed to get workspace: Forbidden"));
    render(<WorkspaceDetailPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to get workspace: Forbidden");
    expect(screen.queryByText("Workspace not found.")).not.toBeInTheDocument();
  });

  it("retains a useful empty detail state", async () => {
    vi.mocked(api.getWorkspace).mockResolvedValueOnce(null as unknown as api.Workspace);
    render(<WorkspaceDetailPage />);
    expect(await screen.findByText("Workspace not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to workspaces" })).toHaveAttribute("href", "/workspaces");
  });

  it("starts a stopped workspace and refreshes its state", async () => {
    vi.mocked(api.getWorkspace).mockResolvedValueOnce({ ...workspaces[0], stopped: true, ready_replicas: 0 });
    vi.mocked(api.startWorkspace).mockResolvedValue(workspaces[0]);
    render(<WorkspaceDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() => expect(api.startWorkspace).toHaveBeenCalledWith("code-studio", "demo"));
    expect(await screen.findByRole("link", { name: "Connect" })).toBeInTheDocument();
  });
});
