import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import type { AuthConfig } from "@/lib/auth";

const auth = vi.hoisted(() => ({
  authConfig: null as AuthConfig | null,
  refresh: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: vi.fn(),
    loginLocal: vi.fn(),
    isAuthenticated: false,
    authEnabled: true,
    authConfig: auth.authConfig,
    loading: false,
    refresh: auth.refresh,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.authConfig = null;
  auth.refresh.mockResolvedValue(null);
});

describe("Login discovery recovery", () => {
  it("explains an unavailable configuration and retries discovery", async () => {
    render(<LoginPage />);
    expect(screen.getByText(/Could not load the sign-in configuration/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry discovery" }));
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Authentication discovery is still unavailable/)).toBeInTheDocument();
  });

  it("explains a configuration with no usable methods", () => {
    auth.authConfig = { enabled: true, methods: [] };
    render(<LoginPage />);
    expect(screen.getByText(/No sign-in methods are available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry discovery" })).toBeInTheDocument();
  });

  it("shows the local form without a discovery warning when local auth is available", () => {
    auth.authConfig = { enabled: true, methods: ["local"], localAuth: { enabled: true } };
    render(<LoginPage />);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry discovery" })).not.toBeInTheDocument();
  });
});
