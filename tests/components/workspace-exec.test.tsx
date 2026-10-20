import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceExec from "@/components/workspace-exec";
import type { AuthUser } from "@/lib/auth";
import type { Workspace } from "@/lib/api";

const auth = vi.hoisted(() => ({ user: { email: "admin@example.com", role: "admin", executionCredentialBound: true } as AuthUser | null, authEnabled: true, loading: false }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));

const workspace: Workspace = { name: "windows-vm", namespace: "demo", type: "vm", vm_profile: "windows11-amd64-v1", image: "windows", ready_replicas: 1, stopped: false };
const ready = { enabled: true, allow_elevated: true, storage_available: true, storage_mode: "ephemeral", durable: false, issuer_ready: false };
const result = { execution_id: "exec_test", recording_id: "rec_test", namespace: "demo", workspace_name: "windows-vm", outcome: "succeeded", state: "succeeded", exit_code: 0, stdout: "aMOpbGxvIOKckw==", stderr: "", durability: "none" };

beforeEach(() => {
  auth.user = { email: "admin@example.com", role: "admin", executionCredentialBound: true };
  auth.authEnabled = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
});

describe("workspace Exec", () => {
  it("opens a modal, executes once with exact workspace scope, and renders decoded output", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    expect(screen.getByRole("dialog", { name: "Exec — windows-vm" })).toBeInTheDocument();
    const run = screen.getByRole("button", { name: "Run as SYSTEM" });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.change(screen.getByLabelText("PowerShell command"), { target: { value: "Write-Output 'héllo ✓'" } });
    fireEvent.click(run);
    expect(await screen.findByText("héllo ✓")).toBeInTheDocument();
    expect(screen.getByText(/Exit code: 0/)).toBeInTheDocument();
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toBe("/api/v1/executions/start");
    expect(options.credentials).toBe("include");
    expect(JSON.parse(options.body)).toEqual({ namespace: "demo", workspace_name: "windows-vm", executable: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Write-Output 'héllo ✓'"], deadline_seconds: 20 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("passes executable arguments verbatim and surfaces nonzero results and truncation", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json({ ...result, state: "failed", outcome: "failed", exit_code: 7, truncated: true, stderr: "ZXJyb3I=" }));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run as SYSTEM" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "executable" } });
    fireEvent.change(screen.getByLabelText("Arguments (JSON array)"), { target: { value: '["argument with spaces", "", "a&b"]' } });
    fireEvent.click(screen.getByRole("button", { name: "Run as SYSTEM" }));
    expect(await screen.findByText(/Exit code: 7/)).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText(/Output truncated/)).toBeInTheDocument();
    expect(JSON.parse(fetcher.mock.calls[1][1].body).args).toEqual(["argument with spaces", "", "a&b"]);
  });

  it("shows policy denial and does not dispatch", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...ready, allow_elevated: false }));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    expect(await screen.findByText("SYSTEM execution is disabled by platform policy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run as SYSTEM" })).toBeDisabled();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not retry a lost response or allow a blind second submission", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockRejectedValueOnce(new TypeError("Network error"));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    const run = screen.getByRole("button", { name: "Run as SYSTEM" });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent("The command may have run");
    expect(run).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404])("reports HTTP %s as a pre-dispatch rejection and permits an explicit retry", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json("not an eligible running Windows VM", { status }))
      .mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    const run = screen.getByRole("button", { name: "Run as SYSTEM" });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent("Command request failed: not an eligible running Windows VM. The command was not dispatched.");
    expect(screen.queryByText(/The command may have run/)).not.toBeInTheDocument();
    expect(run).toBeEnabled();
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.click(run);
    expect(await screen.findByText("héllo ✓")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps a server failure uncertain because it can occur after dispatch", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json("execution recording unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    const run = screen.getByRole("button", { name: "Run as SYSTEM" });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent("The command may have run");
    expect(run).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("hides exec without scoped authority and disables it while stopped", () => {
    auth.user = { email: "editor@example.com", role: "editor", executionCredentialBound: true };
    const view = render(<WorkspaceExec workspace={workspace} />);
    expect(screen.queryByRole("button", { name: "Exec" })).not.toBeInTheDocument();
    auth.user = { email: "admin@example.com", role: "admin", executionCredentialBound: true };
    view.rerender(<WorkspaceExec workspace={{ ...workspace, stopped: true }} />);
    expect(screen.getByRole("button", { name: "Exec" })).toBeDisabled();
    auth.authEnabled = false;
    view.rerender(<WorkspaceExec workspace={workspace} />);
    expect(screen.queryByRole("button", { name: "Exec" })).not.toBeInTheDocument();
  });
});
