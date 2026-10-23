import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WindowsGPUSettings from "@/components/windows-gpu-settings";
import type { VMGPUProfile, Workspace } from "@/lib/api";

const auth = vi.hoisted(() => ({ user: { role: "editor" }, authEnabled: true, loading: false }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
const profile: VMGPUProfile = { id: "intel-vf-v1", display_name: "Intel VF", resource_name: "intel.com/render-vf", kind: "pci", count: 1, node_selector: { "example.com/gpu": "qualified" }, guest_driver_version: "32.0.101.6452", experimental: true };
const workspace: Workspace = { name: "windows", namespace: "demo", type: "vm", vm_profile: "windows11-amd64-v1", image: "private/windows", ready_replicas: 0, stopped: true };

beforeEach(() => { auth.user = { role: "editor" }; });

describe("Windows GPU configuration", () => {
  it("sends only the chosen operator profile ID for a stopped workspace", async () => {
    const updated = { ...workspace, vm_gpu_profile: profile };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json([profile])).mockResolvedValueOnce(Response.json(updated));
    vi.stubGlobal("fetch", fetcher);
    const onUpdated = vi.fn();
    render(<WindowsGPUSettings workspace={workspace} onUpdated={onUpdated} />);
    await screen.findByRole("option", { name: "Intel VF — experimental" });
    fireEvent.change(screen.getByLabelText("Windows GPU profile"), { target: { value: profile.id } });
    fireEvent.click(screen.getByRole("button", { name: "Apply GPU profile" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/workspaces/windows/gpu-profile?namespace=demo");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "PUT", credentials: "include", body: JSON.stringify({ profile_id: profile.id }) });
    expect(screen.getByText(/not observed driver, rendering or encoder status/)).toBeInTheDocument();
  });

  it("keeps GPU changes disabled while running", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([profile])));
    render(<WindowsGPUSettings workspace={{ ...workspace, stopped: false, ready_replicas: 1 }} onUpdated={vi.fn()} />);
    expect(screen.getByLabelText("Windows GPU profile")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply GPU profile" })).toBeDisabled();
    await screen.findByRole("option", { name: "Intel VF — experimental" });
  });

  it("allows software recovery when the profile registry is unavailable and surfaces lifecycle conflicts", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("VM is still shutting down", { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    render(<WindowsGPUSettings workspace={{ ...workspace, vm_gpu_profile: profile }} onUpdated={vi.fn()} />);
    await screen.findByRole("status");
    fireEvent.change(screen.getByLabelText("Windows GPU profile"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply GPU profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("VM is still shutting down");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ profile_id: "" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shows configuration without mutation controls to viewers", () => {
    auth.user = { role: "viewer" };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<WindowsGPUSettings workspace={{ ...workspace, vm_gpu_profile: profile }} onUpdated={vi.fn()} />);
    expect(screen.getByText(/Configured: Intel VF \(experimental\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not deliver a late update to a different workspace after unmount", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json([profile]))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const onUpdated = vi.fn();
    const view = render(<WindowsGPUSettings workspace={workspace} onUpdated={onUpdated} />);
    await screen.findByRole("option", { name: "Intel VF — experimental" });
    fireEvent.change(screen.getByLabelText("Windows GPU profile"), { target: { value: profile.id } });
    fireEvent.click(screen.getByRole("button", { name: "Apply GPU profile" }));
    view.unmount();
    await act(async () => finish(Response.json({ ...workspace, vm_gpu_profile: profile })));
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
