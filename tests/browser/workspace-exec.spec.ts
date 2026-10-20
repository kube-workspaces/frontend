import { expect, test } from "@playwright/test";

test("Windows workspace Exec opens a modal and displays a command result", async ({ page, context }) => {
  await context.addCookies([{ name: "kw-session", value: "demo-fixture", domain: "127.0.0.1", path: "/" }]);
  const workspace = { name: "windows-vm", namespace: "demo", type: "vm", vm_profile: "windows11-amd64-v1", image: "windows", ready_replicas: 1, stopped: false };
  let starts = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api(?=\/)/, "");
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/auth/config") return json({ enabled: true });
    if (path === "/auth/me") return json({ authenticated: true, email: "demo@example.com", role: "viewer", namespaces: ["demo"], executionCredentialBound: true, executionGrants: [{ namespace: "demo", workspaces: ["windows-vm"], permissions: ["workspace.exec", "workspace.exec.elevated"] }] });
    if (path === "/v1/namespaces") return json([{ name: "demo", phase: "Active" }]);
    if (path === "/v1/workspaces/windows-vm") return json(workspace);
    if (path === "/v1/images") return json([]);
    if (path === "/v1/executions/status") return json({ enabled: true, allow_elevated: true, storage_available: true, storage_mode: "bundled", durable: true, issuer_ready: false });
    if (path === "/v1/executions/start") {
      starts++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toMatchObject({ namespace: "demo", workspace_name: "windows-vm", args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "hostname"], deadline_seconds: 20 });
      return json({ execution_id: "exec_browser", recording_id: "rec_browser", namespace: "demo", workspace_name: "windows-vm", outcome: "succeeded", state: "succeeded", exit_code: 0, stdout: Buffer.from("WINDOWS-VM\r\n").toString("base64"), durability: "durable" });
    }
    if (path === "/platform/config") return json({ maintenance: { enabled: false } });
    if (path === "/platform/version") return json({ api: { version: "demo" } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, json: { message: "Not available in fixture" } });
    return route.continue();
  });
  await page.goto("/workspaces/windows-vm?namespace=demo");
  await page.getByRole("button", { name: "Exec", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Exec — windows-vm" });
  await expect(modal).toBeVisible();
  await modal.getByRole("textbox", { name: "PowerShell command", exact: true }).fill("hostname");
  await modal.getByRole("button", { name: "Run as SYSTEM" }).click();
  await expect(modal.getByText("WINDOWS-VM", { exact: true })).toBeVisible();
  await expect(modal.getByText(/Exit code: 0/)).toBeVisible();
  expect(starts).toBe(1);
  await modal.getByRole("button", { name: "Close", exact: true }).click();
  await expect(modal).toHaveCount(0);
});
