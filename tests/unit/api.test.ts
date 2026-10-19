import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { workspaces } from "../fixtures/workspaces";

const payload: api.CreateWorkspacePayload = {
  name: "code-studio", namespace: "demo", type: "container",
  container: { name: "main", image: "example/editor", port: 8080, cpu_request: "500m", memory_request: "1Gi", cpu_limit: "2", memory_limit: "4Gi" },
};

describe("API authentication and request contracts", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset().mockImplementation(async () => Response.json(workspaces[0]));
    vi.stubGlobal("fetch", fetchMock);
  });

  const requests: [string, () => Promise<unknown>, string, string][] = [
    ["list workspaces", () => api.listWorkspaces(), "GET", "/v1/workspaces?namespace=_all"],
    ["workspace detail", () => api.getWorkspace("code-studio", "demo"), "GET", "/v1/workspaces/code-studio?namespace=demo"],
    ["create", () => api.createWorkspace(payload), "POST", "/v1/workspaces"],
    ["update", () => api.updateWorkspace("code-studio", { memory_limit: "8Gi" }, "demo"), "PUT", "/v1/workspaces/code-studio?namespace=demo"],
    ["delete", () => api.deleteWorkspace("code-studio", "demo"), "DELETE", "/v1/workspaces/code-studio?namespace=demo"],
    ["clone", () => api.cloneWorkspace("code-studio", { new_name: "copy" }, "demo"), "POST", "/v1/workspaces/code-studio/clone?namespace=demo"],
    ["start", () => api.startWorkspace("code-studio", "demo"), "POST", "/v1/workspaces/code-studio/start?namespace=demo"],
    ["stop", () => api.stopWorkspace("code-studio", "demo"), "POST", "/v1/workspaces/code-studio/stop?namespace=demo"],
    ["reset", () => api.resetWorkspace("code-studio", "demo"), "POST", "/v1/workspaces/code-studio/reset?namespace=demo"],
    ["reboot", () => api.rebootWorkspace("ubuntu-vm", "demo"), "POST", "/v1/workspaces/ubuntu-vm/reboot?namespace=demo"],
    ["catalog", () => api.listImages(), "GET", "/v1/images"],
    ["volumes", () => api.listVolumes("demo"), "GET", "/v1/volumes?namespace=demo"],
    ["namespaces", () => api.listNamespaces(), "GET", "/v1/namespaces"],
    ["device list", () => api.listDevices(), "GET", "/auth/device/list?scope=own"],
    ["device revoke", () => api.revokeDevice("test-device"), "POST", "/auth/device/revoke"],
  ];
  it.each(requests)("%s includes session cookies and targets the expected route", async (_label, request, method, path) => {
    await request();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api${path}`);
    expect(options?.credentials).toBe("include");
    expect(options?.method || "GET").toBe(method);
    if (method === "GET") expect(options?.cache).toBe("no-store");
  });

  it("serializes create/update bodies as JSON and returns the response", async () => {
    await expect(api.createWorkspace(payload)).resolves.toEqual(workspaces[0]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    await api.updateWorkspace("code-studio", { memory_limit: "8Gi" }, "demo");
    expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify({ memory_limit: "8Gi" }));
  });

  it.each([
    [new Response("namespace denied", { status: 403 }), "namespace denied"],
    [new Response("", { status: 503 }), "503"],
    [new Response("body", { status: 401, statusText: "Unauthorized" }), "Unauthorized"],
  ])("surfaces failed requests including HTTP/2 responses without statusText", async (response, detail) => {
    fetchMock.mockResolvedValueOnce(response);
    await expect(api.listWorkspaces()).rejects.toThrow(`Failed to list workspaces: ${detail}`);
  });

  it("propagates transport failures and does not treat them as empty data", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    await expect(api.getWorkspace("code-studio")).rejects.toThrow("Network unavailable");
  });

  it("does not parse JSON for successful no-content deletion", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.deleteWorkspace("code-studio", "demo")).resolves.toBeUndefined();
  });

  it.each(["", "/", "lab?token=example", "/lab?token=example", "nested/index.html"])("composes same-origin proxy paths for %j", (path) => {
    expect(api.getProxyUrl("demo", "code-studio", path)).toBe(`/proxy/demo/code-studio/${path.replace(/^\//, "")}`);
  });
});
