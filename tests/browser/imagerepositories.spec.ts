import { expect, test } from "@playwright/test";

test("admin creates, edits, syncs and deletes an image repository", async ({ page }) => {
  type Repository = {
    metadata: { name: string; resourceVersion?: string };
    spec: { url: string; paths: string[]; suspend?: boolean };
    status?: { conditions: Array<{ type: string; status: string; reason: string; message: string }> };
  };
  let repository: Repository | null = null;
  let syncs = 0;
  await page.context().addCookies([{ name: "kw-session", value: "demo-fixture", domain: "127.0.0.1", path: "/" }]);
  page.on("dialog", dialog => dialog.accept());
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:3100") return route.abort();
    const path = url.pathname.replace(/^\/api(?=\/)/, "");
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/auth/config") return json({ enabled: true });
    if (path === "/auth/me") return json({ authenticated: true, email: "demo@example.com", role: "admin", namespaces: ["demo"] });
    if (path === "/platform/config") return json({ maintenance: { enabled: false } });
    if (path === "/platform/version") return json({ api: { version: "demo" } });
    if (path === "/admin/crds/imagerepositories") {
      if (request.method() === "POST") {
        repository = request.postDataJSON() as Repository;
        repository.metadata.resourceVersion = "1";
        return json(repository);
      }
      return json({ items: repository ? [repository] : [] });
    }
    if (path === "/admin/crds/imagerepositories/demo-catalog/sync" && repository) {
      syncs++;
      repository.status = { conditions: [{ type: "Ready", status: "False", reason: "InvalidManifests", message: "Skipped 1 invalid manifest(s); pruning withheld. First invalid file: images/broken.yaml" }] };
      return json(repository);
    }
    if (path === "/admin/crds/imagerepositories/demo-catalog") {
      if (request.method() === "PUT") repository = request.postDataJSON() as Repository;
      if (request.method() === "DELETE") {
        repository = null;
        return route.fulfill({ status: 204 });
      }
      return json(repository);
    }
    if (path === "/v1/workspaces" || path === "/v1/namespaces") return json([]);
    if (url.pathname.startsWith("/api/") || path.startsWith("/auth/")) throw new Error(`Unmocked request: ${path}`);
    return route.continue();
  });

  await page.goto("/admin/imagerepositories");
  await page.getByRole("button", { name: "+ Add Image Repository" }).click();
  await page.getByLabel("Name", { exact: true }).fill("demo-catalog");
  await page.getByLabel("Repository URL", { exact: true }).fill("https://git.example.com/catalog.git");
  await expect(page.getByRole("option", { name: "ssh", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "demo-catalog", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ImageRepository: demo-catalog" })).toBeVisible();
  await page.getByRole("button", { name: "Add path" }).click();
  await page.getByLabel("Repository path 2").fill("images/desktop/");
  await page.getByLabel("Suspend", { exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => repository?.spec.paths).toEqual(["images", "images/desktop"]);
  expect(repository?.spec.suspend).toBe(true);
  await page.getByLabel("Suspend", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => repository?.spec.suspend).toBe(false);
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.getByText(/Skipped 1 invalid manifest/)).toBeVisible();
  expect(syncs).toBe(1);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No image repositories found")).toBeVisible();
  expect(repository).toBeNull();
});
