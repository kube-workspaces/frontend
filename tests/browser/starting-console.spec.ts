import { expect, test } from "@playwright/test";

for (const windows of [false, true]) {
  test(`Starting ${windows ? "Windows" : "Linux"} VM enables its recovery display after launch`, async ({ page, context }) => {
    await context.addCookies([{ name: "kw-session", value: "demo-fixture", domain: "127.0.0.1", path: "/" }]);
    let available = false;
    let displays = 0;
    let agents = 0;
    await page.routeWebSocket("**/vnc?*", () => { displays++; });
    await page.routeWebSocket("**/agent/**", () => { agents++; });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^\/api(?=\/)/, "");
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path === "/auth/config") return json({ enabled: true });
      if (path === "/auth/me") return json({ authenticated: true, email: "demo@example.com", role: "editor", namespaces: ["demo"] });
      if (path === "/v1/namespaces") return json([{ name: "demo", phase: "Active" }]);
      if (path === "/v1/workspaces/booting") return json({ name: "booting", namespace: "demo", type: "vm", image: "guest", vm_profile: windows ? "windows11-amd64-v1" : undefined, ready_replicas: 0, stopped: false });
      if (path === "/v1/workspaces/booting/console/status") return json({ inUse: false, available, displayAvailable: available });
      if (path === "/v1/workspaces/booting/vnc/status") return json({ inUse: false });
      if (path === "/v1/images") return json([]);
      if (path === "/platform/config") return json({ maintenance: { enabled: false } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, json: {} });
      return route.continue();
    });
    await page.goto("/workspaces/booting?namespace=demo");
    const display = page.getByRole("button", { name: "Display console", exact: true });
    await expect(display).toBeDisabled();
    available = true;
    await expect(display).toBeEnabled({ timeout: 10000 });
    await expect(page.getByText("Starting", { exact: true }).first()).toBeVisible();
    await display.click();
    await expect.poll(() => displays).toBeGreaterThan(0);
    expect(agents).toBe(0);
  });
}
