import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import WorkspacesPage from "@/app/workspaces/page";
import WorkspaceDetailPage from "@/app/workspaces/[name]/page";
import NewWorkspacePage from "@/app/workspaces/new/page";
import { images, workspaces } from "../fixtures/workspaces";

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
  listVolumes: vi.fn(), listNamespaces: vi.fn(), getPlatformConfig: vi.fn(),
  createWorkspace: vi.fn(), createVolume: vi.fn(), updateWorkspace: vi.fn(),
  getVMConsoleStatus: vi.fn(),
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
  vi.mocked(api.listVolumes).mockResolvedValue([]);
  vi.mocked(api.listNamespaces).mockResolvedValue([{ name: "demo", phase: "Active" }]);
  vi.mocked(api.getPlatformConfig).mockResolvedValue({ formFieldLocks: [] } as unknown as Awaited<ReturnType<typeof api.getPlatformConfig>>);
  vi.mocked(api.createWorkspace).mockResolvedValue(workspaces[0]);
  vi.mocked(api.createVolume).mockResolvedValue({ name: "test-home", namespace: "demo" } as api.Volume);
  vi.mocked(api.updateWorkspace).mockResolvedValue(workspaces[0]);
  vi.mocked(api.getVMConsoleStatus).mockResolvedValue({ inUse: false, available: false, displayAvailable: false });
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
  it("enables a Starting VM's consoles only after backend availability is known", async () => {
    vi.mocked(api.getWorkspace).mockResolvedValue({ ...workspaces[0], type: "vm", ready_replicas: 0 });
    let available!: (status: api.VMConsoleStatus) => void;
    vi.mocked(api.getVMConsoleStatus).mockReturnValue(new Promise((resolve) => { available = resolve; }));
    render(<WorkspaceDetailPage />);
    expect(await screen.findByRole("button", { name: "Display console" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Console", exact: true })).toBeDisabled();
    await act(async () => available({ inUse: false, available: true, displayAvailable: true }));
    expect(screen.getByRole("button", { name: "Display console" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Console", exact: true })).toBeEnabled();
    expect(screen.getAllByText("Starting").length).toBeGreaterThan(0);
  });

  it("does not enable boot consoles when the VMI is unavailable", async () => {
    vi.mocked(api.getWorkspace).mockResolvedValue({ ...workspaces[0], type: "vm", ready_replicas: 0 });
    render(<WorkspaceDetailPage />);
    expect(await screen.findByRole("button", { name: "Display console" })).toBeDisabled();
    await waitFor(() => expect(api.getVMConsoleStatus).toHaveBeenCalledWith("code-studio", "demo"));
    expect(screen.getByRole("button", { name: "Console", exact: true })).toBeDisabled();
  });

  it("keeps stopped VMs' consoles hidden", async () => {
    vi.mocked(api.getWorkspace).mockResolvedValue({ ...workspaces[0], type: "vm", stopped: true, ready_replicas: 0 });
    render(<WorkspaceDetailPage />);
    await screen.findByRole("heading", { name: "code-studio" });
    expect(screen.queryByRole("button", { name: "Display console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Console", exact: true })).not.toBeInTheDocument();
    expect(api.getVMConsoleStatus).not.toHaveBeenCalled();
  });

  it("preserves a read-only mount on edit and sends explicit false when made writable", async () => {
    vi.mocked(api.getWorkspace).mockResolvedValue({ ...workspaces[0], volume_mounts: [{ name: "data", mount_path: "/data", readonly: true }] });
    render(<WorkspaceDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const mode = await screen.findByRole("checkbox", { name: "Read-only" });
    expect(mode).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(api.updateWorkspace).toHaveBeenCalledWith("code-studio", expect.objectContaining({ volume_mounts: [{ name: "data", mount_path: "/data", readonly: true }] }), "demo"));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Read-only" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(api.updateWorkspace).toHaveBeenLastCalledWith("code-studio", expect.objectContaining({ volume_mounts: [{ name: "data", mount_path: "/data", readonly: false }] }), "demo"));
  });
  it("renders loading followed by the selected workspace and opens its app in a modal", async () => {
    render(<WorkspaceDetailPage />);
    expect(screen.getByText("Loading workspace...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "code-studio" })).toBeInTheDocument();
    expect(api.getWorkspace).toHaveBeenCalledWith("code-studio", "demo");
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("dialog", { name: "Connect: code-studio" })).toBeInTheDocument();
    expect(screen.getByTitle("Workspace app: code-studio")).toHaveAttribute("src", "/proxy/demo/code-studio/");
    fireEvent.click(screen.getByRole("button", { name: "Close (Ctrl+Esc)" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays the request error instead of misreporting every failure as not found", async () => {
    vi.mocked(api.getWorkspace).mockRejectedValueOnce(new Error("Failed to get workspace: Forbidden"));
    render(<WorkspaceDetailPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to get workspace: Forbidden");
    expect(screen.queryByText("Workspace not found.")).not.toBeInTheDocument();
  });

  it("keeps the app mounted through maximize and minimize, and can open it in a new tab", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(api.listImages).mockResolvedValue([{ ...images[0], image: workspaces[0].image, default_path: "/files/" }]);
    render(<WorkspaceDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
    const frame = screen.getByTitle("Workspace app: code-studio");
    expect(frame).toHaveAttribute("src", "/proxy/demo/code-studio/files/");
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(screen.getByRole("dialog")).toHaveClass("fixed", "inset-0");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.getByRole("dialog")).not.toHaveClass("fixed");
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(frame).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Raise (restore)" }));
    expect(screen.getByTitle("Workspace app: code-studio")).toBe(frame);
    fireEvent.click(screen.getByRole("button", { name: "Open in new tab" }));
    expect(open).toHaveBeenCalledWith("/proxy/demo/code-studio/files/", "_blank", "noopener,noreferrer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    open.mockRestore();
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
    expect(await screen.findByRole("button", { name: "Connect" })).toBeInTheDocument();
  });
});

describe("workspace volume creation", () => {
  it("submits container Secret initialization and structured application overrides", async () => {
    vi.mocked(api.listImages).mockResolvedValue([{ ...images[0], default_command: ["sleep"], default_user_data: "#cloud-config\nruncmd: []\n" }]);
    render(<NewWorkspacePage />);
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "init" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Initialization mode" }), { target: { value: "injected" } });
    fireEvent.change(screen.getByRole("combobox", { name: "User-data source" }), { target: { value: "secret" } });
    fireEvent.change(screen.getByRole("textbox", { name: /User-data Secret name/ }), { target: { value: "private-init" } });
    // Use a valid JSON argv whose final empty argument must survive serialization.
    fireEvent.change(screen.getByRole("textbox", { name: /Command override/ }), { target: { value: JSON.stringify(["app", "a b", ""]) } });
    fireEvent.change(screen.getByRole("textbox", { name: /Arguments override/ }), { target: { value: "[]" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Application run-as account/ }), { target: { value: "nobody" } });
    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      type: "container", container_init: { mode: "injected", user_data_secret: "private-init", default_user: "", run_as_user: "nobody" },
      container: expect.objectContaining({ command: ["app", "a b", ""], args: [] }),
    })));
  });

  it("rejects invalid initialization before creating a home volume", async () => {
    vi.mocked(api.listImages).mockResolvedValue([{ ...images[0], default_homedir: "/home/coder", default_command: ["sleep"] }]);
    render(<NewWorkspacePage />);
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "invalid-init" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Initialization mode" }), { target: { value: "injected" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Cloud-config/ }), { target: { value: "not cloud-config" } });
    fireEvent.submit(name.closest("form")!);
    expect(await screen.findByText(/Inline user-data must begin/)).toBeInTheDocument();
    expect(api.createVolume).not.toHaveBeenCalled();
    expect(api.createWorkspace).not.toHaveBeenCalled();
  });

  it.each([false, true])("keeps home writable and submits additional readonly=%s", async (readOnly) => {
    vi.mocked(api.listImages).mockResolvedValue([{ ...images[0], default_homedir: "/home/coder" }]);
    render(<NewWorkspacePage />);
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "test" } });
    const homeMode = screen.getByRole("checkbox", { name: /home volume must be writable/ });
    expect(homeMode).not.toBeChecked();
    expect(homeMode).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "+ New Volume" }));
    const volumeName = screen.getAllByPlaceholderText("my-data")[1];
    fireEvent.change(volumeName, { target: { value: "extra" } });
    const extraMode = screen.getByRole("checkbox", { name: "Read-only" });
    expect(extraMode).not.toBeChecked();
    if (readOnly) fireEvent.click(extraMode);
    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith(expect.objectContaining({ volume_mounts: [
      { name: "test-home", mount_path: "/home/coder", readonly: false },
      { name: "extra", mount_path: "/data", readonly: readOnly },
    ] })));
  });
});

describe("scratch workspace creation", () => {
  it("preserves catalog command and args by omitting a scratch override", async () => {
    vi.mocked(api.listImages).mockResolvedValue([{ ...images[0], name: "Injected Alpine", workspace_types: ["container", "scratch"], default_command: ["sleep"], default_args: ["infinity"], default_container_init: { mode: "injected" } }]);
    render(<NewWorkspacePage />);
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "injected" } });
    fireEvent.click(screen.getByRole("button", { name: /Scratch Deployment/ }));
    expect(screen.getByRole("textbox", { name: /Command/ })).toHaveValue("");
    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createWorkspace).mock.calls[0][0].container.command).toBeUndefined();
  });

  it("preserves shell source and empty arguments in explicit JSON argv", async () => {
    render(<NewWorkspacePage />);
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "argv" } });
    fireEvent.click(screen.getByRole("button", { name: /Scratch Deployment/ }));
    const command = ["/bin/sh", "-c", "printf '%s' \"$1\"", "app", "a b", ""];
    fireEvent.change(screen.getByRole("textbox", { name: /Command/ }), { target: { value: JSON.stringify(command) } });
    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createWorkspace).mock.calls[0][0].container.command).toEqual(command);
  });

  it("rejects malformed command overrides before creating resources", async () => {
    render(<NewWorkspacePage />);
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: /Scratch Deployment/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Command/ }), { target: { value: "sh -c 'echo hello'" } });
    fireEvent.submit(name.closest("form")!);
    expect(await screen.findByText(/Command override must be a JSON argv array/)).toBeInTheDocument();
    expect(api.createWorkspace).not.toHaveBeenCalled();
    expect(api.createVolume).not.toHaveBeenCalled();
  });

  it("offers supported catalog images and submits an edited custom command", async () => {
    vi.mocked(api.listImages).mockResolvedValue(images);
    render(<NewWorkspacePage />);
    const nameInput = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(nameInput, { target: { value: "scratch-command" } });
    fireEvent.click(screen.getByRole("button", { name: /Scratch Deployment/ }));
    expect(screen.getByRole("radio", { name: /Alpine Linux/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /Code Studio/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Command/ })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Custom Image" }));
    expect(screen.getByRole("textbox", { name: "Image" })).toHaveValue("alpine");
    fireEvent.change(screen.getByRole("textbox", { name: /Command/ }), { target: { value: '["sleep","3600"]' } });
    fireEvent.click(screen.getByRole("button", { name: "Create Workspace" }));
    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      type: "scratch", container: expect.objectContaining({ image: "alpine", command: ["sleep", "3600"] }),
    })));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/workspaces"));
  });

  it("defaults to alpine image and sleep infinity command for scratch workspaces and launches successfully", async () => {
    render(<NewWorkspacePage />);
    const nameInput = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(nameInput, { target: { value: "myscratch" } });
    fireEvent.click(screen.getByRole("button", { name: /Scratch/ }));
    const imageInput = screen.getByRole("textbox", { name: "Image" });
    expect(imageInput).toHaveValue("alpine");
    const commandInput = screen.getByRole("textbox", { name: /Command/ });
    expect(commandInput).toHaveValue('["sleep","infinity"]');
    fireEvent.submit(nameInput.closest("form")!);
    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      name: "myscratch",
      type: "scratch",
      container: expect.objectContaining({
        image: "alpine",
        command: ["sleep", "infinity"],
      }),
    })));
  });
});
