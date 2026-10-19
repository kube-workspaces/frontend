import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { images, workspaces } from "../fixtures/workspaces";

async function demoAPI(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3100") return route.abort();
    const pathname = url.pathname.replace(/^\/api(?=\/)/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (pathname === "/auth/config") return json({ enabled: true, localAuth: { enabled: true } });
    if (pathname === "/auth/login/local") {
      return route.fulfill({ json: { status: "ok", mustChangePassword: false }, headers: { "set-cookie": "kw-session=demo-fixture; Path=/; HttpOnly; SameSite=Lax" } });
    }
    if (pathname === "/auth/me") return json({
      authenticated: (route.request().headers().cookie || "").includes("kw-session=demo-fixture"),
      email: "demo@example.com", displayName: "Demo User", role: "editor", namespaces: ["demo"], personalNamespace: "demo",
    });
    if (pathname === "/v1/namespaces") return json([{ name: "demo", phase: "Active" }]);
    if (pathname === "/v1/images") return json(images);
    if (pathname === "/v1/volumes") return json([]);
    if (pathname === "/v1/workspaces/watch") return route.abort(); // exercise the real polling fallback
    if (pathname === "/v1/workspaces") return json(workspaces);
    if (pathname === "/platform/config") return json({ maintenance: { enabled: false } });
    if (pathname === "/platform/version") return json({ api: { version: "demo" } });
    if (url.pathname.startsWith("/api/") || pathname.startsWith("/auth/")) {
      throw new Error(`Unmocked demo API request: ${pathname}`);
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("workspaces-view", "tiles");
    localStorage.setItem("selectedNamespace", "demo");
  });
}

for (const { name, width, height } of [
  { name: "wide", width: 1920, height: 1080 },
  { name: "narrow", width: 750, height: 1334 },
]) {
  test(`signed-in ${name} workspace view and install screenshot`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await demoAPI(page);
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill("demo@example.com");
    await page.getByPlaceholder("Password").fill("demo-fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/workspaces");
    await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();
    await expect(page.getByText("code-studio", { exact: true })).toBeVisible();
    await expect(page.getByText("research-notebook", { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await page.context().cookies()).some((cookie) => cookie.name === "kw-session")).toBe(true);
    if (process.env.UPDATE_PWA_SCREENSHOTS === "1") {
      await page.screenshot({ path: `public/screenshot-${name}.png`, animations: "disabled" });
    }
  });
}

test("manifest advertises desktop and mobile PNGs with accurate sizes", async ({ request }) => {
  const response = await request.get("/manifest.json");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.screenshots.some((shot: { form_factor?: string }) => shot.form_factor === "wide")).toBe(true);
  expect(manifest.screenshots.some((shot: { form_factor?: string }) => shot.form_factor !== "wide")).toBe(true);
  for (const shot of manifest.screenshots) {
    const bytes = await readFile(path.join("public", shot.src));
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(shot.sizes).toBe(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`);
    expect(shot.type).toBe("image/png");
  }
});

for (const origin of ["http://127.0.0.1:3100", "http://127.0.0.1:3102"]) {
  test(`install screenshots bypass escaped-workspace proxy recovery at ${origin}`, async ({ request }) => {
    for (const name of ["wide", "narrow"]) {
      const response = await request.get(`${origin}/screenshot-${name}.png`, { headers: {
        Cookie: "kw-proxy-prefix=/proxy/demo/code-studio",
        Referer: `${origin}/proxy/demo/code-studio/`,
        "Sec-Fetch-Dest": "image",
      }, maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      expect(await response.body()).toEqual(await readFile(`public/screenshot-${name}.png`));
    }
  });
}
