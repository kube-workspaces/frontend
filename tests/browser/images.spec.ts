import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`image catalog filtering at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.context().addCookies([{ name: "kw-session", value: "demo-fixture", domain: "127.0.0.1", path: "/" }]);
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:3100") return route.abort();
      const pathname = url.pathname.replace(/^\/api(?=\/)/, "");
      const json = (body: unknown) => route.fulfill({ json: body });
      if (pathname === "/auth/config") return json({ enabled: true });
      if (pathname === "/auth/me") return json({ authenticated: true, email: "demo@example.com", role: "editor", namespaces: ["demo"] });
      if (pathname === "/v1/images") return json([
        { cr_name: "code", name: "Code Studio", description: "A development environment in your browser.", image: "ghcr.io/example/code:latest", default_port: 8080, category: "IDE", tags: ["linux", "development"], source_repository: "official" },
        { cr_name: "desktop", name: "Linux Desktop", description: "A full desktop for everyday tasks.", image: "ghcr.io/example/desktop:latest", default_port: 6080, category: "Desktop", tags: ["linux", "browser"], source_repository: "community" },
        { cr_name: "notebook", name: "Notebook", description: "Interactive Python notebooks.", image: "ghcr.io/example/notebook:latest", default_port: 8888, category: "IDE", tags: ["python", "development"], source_repository: "community" },
      ]);
      if (pathname === "/v1/workspaces" || pathname === "/v1/namespaces") return json([]);
      if (pathname === "/platform/config") return json({ maintenance: { enabled: false } });
      if (pathname === "/platform/version") return json({ api: { version: "demo" } });
      if (url.pathname.startsWith("/api/") || pathname.startsWith("/auth/")) throw new Error(`Unmocked request: ${pathname}`);
      return route.continue();
    });
    await page.goto("/images");
    await expect(page.getByRole("status")).toHaveText("3 of 3 images");
    if (width < 1024) {
      await expect(page.getByRole("complementary", { name: "Image filters" })).toBeHidden();
      await page.getByRole("button", { name: "Filters", exact: true }).click();
    }
    await page.getByRole("group", { name: "Categories", exact: true }).getByRole("checkbox", { name: /^IDE / }).check();
    await expect(page.getByRole("status")).toHaveText("2 of 3 images");
    await page.getByRole("group", { name: "Source repositories" }).getByRole("checkbox", { name: /^community / }).check();
    await expect(page.getByRole("status")).toHaveText("1 of 3 images");
    if (width < 1024) await page.getByRole("button", { name: "Filters (2)", exact: true }).click();
    await expect(page.getByRole("link", { name: "Notebook", exact: true })).toBeVisible();
    for (const mode of ["List", "Compact", "Tiles"]) {
      await page.getByRole("button", { name: `${mode} view` }).click();
      await expect(page.getByRole("link", { name: "Notebook", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.getByRole("button", { name: "Remove Category: IDE" }).click();
    await expect(page.getByRole("status")).toHaveText("2 of 3 images");
    await page.getByRole("button", { name: "Clear all filters", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("3 of 3 images");
    await page.screenshot({ path: testInfo.outputPath("images-light.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({ path: testInfo.outputPath("images-dark.png"), fullPage: true });
  });
}
