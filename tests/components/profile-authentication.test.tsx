import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "@/app/profile/page";
import type { AuthConfig, AuthUser } from "@/lib/auth";

const auth = vi.hoisted(() => ({ user: null as AuthUser | null, authConfig: null as AuthConfig | null }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/namespace", () => ({ useNamespace: () => ({ namespace: "personal", setNamespace: vi.fn() }) }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/ssh-keys-panel", () => ({ default: () => null }));
vi.mock("@/components/devices-panel", () => ({ default: () => null }));

beforeEach(() => {
  auth.authConfig = { enabled: true, issuerURL: "https://idp.example.com", localAuth: { enabled: true } };
  auth.user = { email: "user@example.com", role: "editor" };
});

describe("method-aware account profile", () => {
  it("identifies a local session in a mixed deployment and offers its password capability", () => {
    auth.user = { ...auth.user!, authMethod: "local", localPasswordEnabled: true, canChangePassword: true };
    render(<ProfilePage />);
    expect(screen.getByText("Local password")).toBeInTheDocument();
    expect(screen.queryByText("SSO")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change password" })).toHaveAttribute("href", "/change-password");
  });

  it("does not offer a password action to an OIDC-only account when installation-wide local auth is on", () => {
    auth.user = { ...auth.user!, authMethod: "oidc", oidcLinked: true, localPasswordEnabled: false, canChangePassword: false };
    render(<ProfilePage />);
    expect(screen.getByText("SSO")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change password" })).not.toBeInTheDocument();
  });

  it("keeps password management available to a linked account signed in through OIDC", () => {
    auth.user = { ...auth.user!, authMethod: "oidc", localPasswordEnabled: true, canChangePassword: true, mustChangePassword: false };
    render(<ProfilePage />);
    expect(screen.getByText("SSO")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change password" })).toBeInTheDocument();
  });

  it("does not infer a session method or credential eligibility when the server did not supply them", () => {
    render(<ProfilePage />);
    expect(screen.queryByText("SSO")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change password" })).not.toBeInTheDocument();
  });
});
