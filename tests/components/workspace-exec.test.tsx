import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceExec from "@/components/workspace-exec";
import type { AuthUser } from "@/lib/auth";
import type { Workspace } from "@/lib/api";

const auth = vi.hoisted(() => ({ user: { email: "admin@example.com", role: "admin", executionCredentialBound: true } as AuthUser | null, authEnabled: true, loading: false }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));

const workspace: Workspace = { name: "windows-vm", namespace: "demo", type: "vm", vm_profile: "windows11-amd64-v1", image: "windows", ready_replicas: 1, stopped: false };
const ready = { enabled: true, allow_elevated: true, storage_available: true, storage_mode: "ephemeral", durable: false, issuer_ready: false };
const linuxWorkspace: Workspace = { ...workspace, name: "linux-vm", vm_profile: undefined, execution_identity: "root" };
const scriptCaps = { namespace: "demo", workspace_name: "linux-vm", workspace_uid: "uid-1", os_identity: "root", script_supported: true, script_request_version: 2, interpreter_policy: "linux-shebang-v1", max_script_bytes: 65536, reason: "" };
const windowsCaps = { ...scriptCaps, workspace_name: "windows-vm", os_identity: "SYSTEM", interpreter_policy: "windows-powershell-v1" };
const windowsUnsupported = { ...windowsCaps, script_supported: false, script_request_version: 0, interpreter_policy: "", max_script_bytes: 0 };
const result = { execution_id: "exec_test", recording_id: "rec_test", namespace: "demo", workspace_name: "windows-vm", outcome: "succeeded", state: "succeeded", exit_code: 0, stdout: "aMOpbGxvIOKckw==", stderr: "", durability: "none" };

beforeEach(() => {
  auth.user = { email: "admin@example.com", role: "admin", executionCredentialBound: true };
  auth.authEnabled = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
});

describe("workspace Exec", () => {
  it("uses discovered Linux root identity and sends executable argv without PowerShell", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json({ ...scriptCaps, script_supported: false })).mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={{ ...workspace, name: "linux-vm", vm_profile: undefined, execution_identity: "root" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    const run = screen.getByRole("button", { name: "Run as root" });
    await waitFor(() => expect(run).toBeEnabled());
    expect(screen.getByText(/Linux · root \(elevated\)/)).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "PowerShell command" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Executable")).toHaveValue("/usr/bin/id");
    fireEvent.change(screen.getByLabelText("Arguments (JSON array)"), { target: { value: '["-u"]' } });
    fireEvent.click(run);
    await screen.findByText("héllo ✓");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ namespace: "demo", workspace_name: "linux-vm", executable: "/usr/bin/id", args: ["-u"], deadline_seconds: 20 });
  });

  it("offers Script only after matching guest support and submits the full multiline body once", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(scriptCaps)).mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={linuxWorkspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    await screen.findByRole("option", { name: "Script" });
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/executions/capabilities?namespace=demo&workspace_name=linux-vm");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: "include", cache: "no-store" });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "script" } });
    expect(screen.getByLabelText("Script body")).toHaveValue("#!/bin/sh\nprintf 'hello\\n'\n");
    const body = "#!/usr/bin/python3\nprint('héllo ✓')\n";
    fireEvent.change(screen.getByLabelText("Script body"), { target: { value: body } });
    fireEvent.change(screen.getByLabelText("Working directory (optional)"), { target: { value: "/tmp" } });
    expect(screen.getByText(/Interpreter: \/usr\/bin\/python3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run as root" }));
    await screen.findByText("héllo ✓");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ namespace: "demo", workspace_name: "linux-vm", deadline_seconds: 20, script: { body, name: "run.sh", cwd: "/tmp" } });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    { ...scriptCaps, script_supported: false },
    { ...scriptCaps, script_request_version: 1 },
    { ...scriptCaps, workspace_name: "other-vm" },
    { ...scriptCaps, interpreter_policy: "unknown" },
  ])("does not enable Script from incompatible discovery: %j", async (caps) => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(caps));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={linuxWorkspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    await screen.findByText("Guest does not advertise compatible Linux script support.");
    expect(screen.queryByRole("option", { name: "Script" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run as root" })).toBeEnabled();
  });

  it("keeps commands usable when an older API cannot discover scripts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json("not found", { status: 404 })));
    render(<WorkspaceExec workspace={linuxWorkspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    await screen.findByText(/Script support could not be checked/);
    expect(screen.queryByRole("option", { name: "Script" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run as root" })).toBeEnabled();
  });

  it("local script validation permits correction without dispatch or uncertainty", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(scriptCaps)).mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={linuxWorkspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    await screen.findByRole("option", { name: "Script" });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "script" } });
    fireEvent.change(screen.getByLabelText("Script body"), { target: { value: "#!/usr/bin/env bash\necho hi\n" } });
    const run = screen.getByRole("button", { name: "Run as root" });
    fireEvent.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent("The script was not dispatched.");
    expect(run).toBeEnabled();
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByLabelText("Script body"), { target: { value: "#!/bin/sh\necho hi\n" } });
    fireEvent.click(run);
    await screen.findByText("héllo ✓");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("blocks a selected script if refresh withdraws support and never silently changes modes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(scriptCaps))
      .mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json({ ...scriptCaps, script_supported: false }));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={linuxWorkspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    await screen.findByRole("option", { name: "Script" });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "script" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh availability" }));
    await screen.findByText("Guest does not advertise compatible Linux script support.");
    expect(screen.getByRole("button", { name: "Run as root" })).toBeDisabled();
    expect(screen.getByLabelText("Mode")).toHaveValue("script");
    expect(screen.getByLabelText("Script body")).toBeInTheDocument();
  });

  it("does not retry or permit a second script submission after response loss", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(scriptCaps)).mockRejectedValueOnce(new TypeError("Network error"));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={linuxWorkspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    await screen.findByRole("option", { name: "Script" });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "script" } });
    fireEvent.click(screen.getByRole("button", { name: "Run as root" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The script may have run");
    expect(screen.getByRole("button", { name: "Run as root" })).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not infer Linux execution support from VM type alone", () => {
    render(<WorkspaceExec workspace={{ ...workspace, vm_profile: undefined }} />);
    expect(screen.queryByRole("button", { name: "Exec" })).not.toBeInTheDocument();
  });
  it("opens a modal, executes once with exact workspace scope, and renders decoded output", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(windowsUnsupported)).mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    expect(screen.getByRole("dialog", { name: "Exec — windows-vm" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Script" })).not.toBeInTheDocument();
    const run = screen.getByRole("button", { name: "Run as SYSTEM" });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.change(screen.getByLabelText("PowerShell command"), { target: { value: "Write-Output 'héllo ✓'" } });
    fireEvent.click(run);
    expect(await screen.findByText("héllo ✓")).toBeInTheDocument();
    expect(screen.getByText(/Exit code: 0/)).toBeInTheDocument();
    const [url, options] = fetcher.mock.calls[2];
    expect(url).toBe("/api/v1/executions/start");
    expect(options.credentials).toBe("include");
    expect(JSON.parse(options.body)).toEqual({ namespace: "demo", workspace_name: "windows-vm", executable: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Write-Output 'héllo ✓'"], deadline_seconds: 20 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("passes executable arguments verbatim and surfaces nonzero results and truncation", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(windowsUnsupported)).mockResolvedValueOnce(Response.json({ ...result, state: "failed", outcome: "failed", exit_code: 7, truncated: true, stderr: "ZXJyb3I=" }));
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
    expect(JSON.parse(fetcher.mock.calls[2][1].body).args).toEqual(["argument with spaces", "", "a&b"]);
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
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(windowsUnsupported)).mockRejectedValueOnce(new TypeError("Network error"));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    const run = screen.getByRole("button", { name: "Run as SYSTEM" });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent("The command may have run");
    expect(run).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404])("reports HTTP %s as a pre-dispatch rejection and permits an explicit retry", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(windowsUnsupported))
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
    expect(fetcher).toHaveBeenCalledTimes(3);
    fireEvent.click(run);
    expect(await screen.findByText("héllo ✓")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("keeps a server failure uncertain because it can occur after dispatch", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(windowsUnsupported))
      .mockResolvedValueOnce(Response.json("execution recording unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    const run = screen.getByRole("button", { name: "Run as SYSTEM" });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent("The command may have run");
    expect(run).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("offers Windows Script only for the matching SYSTEM PowerShell policy", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(ready)).mockResolvedValueOnce(Response.json(windowsCaps)).mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkspaceExec workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Exec" }));
    await screen.findByRole("option", { name: "Script" });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "script" } });
    expect(screen.getByLabelText("Script body")).toHaveValue("#!powershell\nWrite-Output 'hello'\n");
    fireEvent.change(screen.getByLabelText("Script body"), { target: { value: "#!/usr/bin/env pwsh\nWrite-Output hi\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Run as SYSTEM" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The script was not dispatched");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const body = "#!powershell\r\nWrite-Output 'héllo ✓'\r\n";
    fireEvent.change(screen.getByLabelText("Script body"), { target: { value: body } });
    fireEvent.click(screen.getByRole("button", { name: "Run as SYSTEM" }));
    await screen.findByText("héllo ✓");
    // Textareas normalize CRLF to LF before the submitted body is signed.
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ namespace: "demo", workspace_name: "windows-vm", deadline_seconds: 20, script: { body: body.replaceAll("\r\n", "\n"), name: "run.ps1" } });
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
