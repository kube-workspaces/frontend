import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthenticationPage from "@/app/admin/settings/page";
import UsersPage from "@/app/admin/users/page";
import type { AuthConfig, AuthUser } from "@/lib/auth";

const auth = vi.hoisted(() => ({ authConfig: null as AuthConfig | null, user: null as AuthUser | null, refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.authConfig = { enabled: true, issuerURL: "https://idp.example.com", localAuth: { enabled: true } };
  auth.user = null;
  auth.refresh.mockResolvedValue(undefined);
});

describe("Authentication administration", () => {
  it("saves local and OIDC together without dropping bootstrap, session or provider settings", async () => {
    const spec = {
      enabled: true,
      localAuth: { enabled: false, bootstrapAdmin: { email: "admin@example.com", mustChangePassword: false } },
      oidc: { issuerURL: "https://idp.example.com", clientID: "workspaces", clientSecret: { name: "oidc", key: "secret" } },
      session: { signingKey: { name: "session", key: "key" }, tokenExpiry: "24h" },
    };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "PUT" ? {} : { spec })));
    vi.stubGlobal("fetch", fetcher);
    render(<AuthenticationPage />);
    const local = await screen.findByRole("checkbox", { name: "Enable local passwords" });
    expect(local).not.toBeChecked();
    fireEvent.click(local);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await screen.findByText("Settings saved successfully");
    const save = fetcher.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(save?.[1]?.credentials).toBe("include");
    expect(JSON.parse(save![1]!.body as string)).toEqual({ spec: { ...spec, localAuth: { ...spec.localAuth, enabled: true } } });
    expect(auth.refresh).toHaveBeenCalledOnce();
  });

  it("saves a local-only configuration and retains explicit false bootstrap policy", async () => {
    const spec = { enabled: true, localAuth: { enabled: true, bootstrapAdmin: { mustChangePassword: false } } };
    const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ spec })));
    vi.stubGlobal("fetch", fetcher);
    render(<AuthenticationPage />);
    expect(await screen.findByRole("checkbox", { name: "Enable local passwords" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await screen.findByText("Settings saved successfully");
    const save = fetcher.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(save![1]!.body as string)).toEqual({ spec });
  });

  it("rejects enabling sign-in without any method and an incomplete OIDC provider", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ spec: { enabled: true } })));
    vi.stubGlobal("fetch", fetcher);
    render(<AuthenticationPage />);
    await screen.findByRole("checkbox", { name: "Require sign-in" });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enable local password authentication or configure an OIDC provider");
    expect(fetcher).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole("textbox", { name: "OIDC issuer URL" }), { target: { value: "https://idp.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("An OIDC client ID is required");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("Users credential administration", () => {
  it("authorizes a bounded invitation for an unbound OIDC-only account", async () => {
    auth.user = { email: "admin@example.com", role: "admin" };
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/auth/oidc/adoptions") return new Response(JSON.stringify({ adoptionURL: "/auth/oidc/adopt?code=invitation", email: "legacy@example.com", expiresAt: 2000000000 }));
      if (url.endsWith("/admin/namespaces")) return new Response("[]");
      return new Response(JSON.stringify({ items: [
        { metadata: { name: "legacy" }, spec: { email: "legacy@example.com", role: "editor" } },
        { metadata: { name: "linked" }, spec: { email: "linked@example.com", role: "editor", externalIdentities: [{ issuer: "https://idp.example.com", subject: "bound" }] } },
        { metadata: { name: "local" }, spec: { email: "local@example.com", role: "editor", localAuth: { enabled: true } } },
      ] }));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<UsersPage />);
    const button = await screen.findByRole("button", { name: "Authorize OIDC adoption" });
    expect(screen.getAllByRole("button", { name: "Authorize OIDC adoption" })).toHaveLength(1);
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "OIDC adoption for legacy@example.com" });
    expect(within(dialog).getByRole("textbox", { name: "OIDC adoption invitation" })).toHaveValue(`${window.location.origin}/auth/oidc/adopt?code=invitation`);
    expect(fetcher).toHaveBeenCalledWith("/auth/oidc/adoptions", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "X-KW-Link-Intent": "adopt-legacy-identity" },
      body: JSON.stringify({ userName: "legacy" }),
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports adoption denial without displaying an invitation", async () => {
    auth.user = { email: "admin@example.com", role: "admin" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/auth/oidc/adoptions") return new Response('{"message":"Sign in again before adoption"}', { status: 403 });
      if (url.endsWith("/admin/namespaces")) return new Response("[]");
      return new Response('{"items":[{"metadata":{"name":"legacy"},"spec":{"email":"legacy@example.com","role":"editor"}}]}');
    }));
    render(<UsersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Authorize OIDC adoption" }));
    await screen.findByText("Sign in again before adoption");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("starts explicit own-account linking with credentials and reports a denied session", async () => {
    auth.user = { email: "admin@example.com", role: "admin" };
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/auth/oidc/link") return new Response(JSON.stringify({ message: "Sign in again before linking" }), { status: 403 });
      if (url.endsWith("/admin/namespaces")) return new Response("[]");
      return new Response(JSON.stringify({ items: [] }));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<UsersPage />);
    const button = await screen.findByRole("button", { name: "Link my OIDC identity" });
    expect(screen.getByText(/Link your OIDC sign-in to admin@example.com/)).toBeInTheDocument();
    fireEvent.click(button);
    await screen.findByText("Sign in again before linking");
    expect(fetcher).toHaveBeenCalledWith("/auth/oidc/link", {
      method: "POST", credentials: "include", headers: { "X-KW-Link-Intent": "link-own-identity" },
    });
    expect(button).toBeEnabled();
  });

  it("blocks linking until a temporary local password has been changed", async () => {
    auth.user = { email: "admin@example.com", role: "admin", mustChangePassword: true };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.endsWith("/admin/namespaces") ? "[]" : '{"items":[]}')));
    render(<UsersPage />);
    expect(await screen.findByRole("button", { name: "Link my OIDC identity" })).toBeDisabled();
  });

  const user = { metadata: { name: "ada" }, spec: { email: "ada@example.com", role: "editor" } };

  function mockUsers() {
    let local = false;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/admin/namespaces")) return new Response("[]");
      if (init?.method === "PUT") {
        local = true;
        return new Response(JSON.stringify({ user, password: "temporary-password" }));
      }
      if (init?.method === "POST") return new Response(JSON.stringify({ password: "reset-password" }));
      return new Response(JSON.stringify({ items: [{ ...user, spec: { ...user.spec, localAuth: { enabled: local } } }] }));
    });
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  }

  it.each([
    { mode: "local-only", config: { enabled: true, localAuth: { enabled: true } }, methods: ["Local password"] },
    { mode: "OIDC-only", config: { enabled: true, issuerURL: "https://idp.example.com" }, methods: ["SSO (OIDC)"] },
    { mode: "mixed", config: { enabled: true, issuerURL: "https://idp.example.com", localAuth: { enabled: true } }, methods: ["SSO (OIDC)", "Local password"] },
  ])("offers only enabled creation methods in $mode", async ({ config, methods }) => {
    auth.authConfig = config;
    const fetcher = mockUsers();
    render(<UsersPage />);
    await screen.findByText("ada@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));
    const select = screen.getByRole("combobox", { name: "Sign-in method" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(methods);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create", exact: true }));
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const create = fetcher.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(create![1]!.body as string).authMethod).toBe(config.issuerURL ? "oidc" : "local");
  });

  it("adds a local password to the same account and supports subsequent reset", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const fetcher = mockUsers();
    render(<UsersPage />);
    expect(await screen.findByText("No local password")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enable local password" }));
    await screen.findByText("temporary-password");
    const update = fetcher.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(update?.[0]).toMatch(/\/admin\/users\/ada$/);
    expect(update?.[1]?.credentials).toBe("include");
    expect(JSON.parse(update![1]!.body as string)).toEqual({ enableLocalAuth: true });
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset password" }));
    await screen.findByText("reset-password");
    expect(fetcher.mock.calls.find(([, init]) => init?.method === "POST")?.[0]).toMatch(/\/admin\/users\/ada\/reset-password$/);
  });

  it("disables credential creation when configuration is unavailable", async () => {
    auth.authConfig = null;
    mockUsers();
    render(<UsersPage />);
    await screen.findByText("ada@example.com");
    expect(screen.getByRole("button", { name: "Create User" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Enable local password" })).not.toBeInTheDocument();
  });
});
