import type { AuthUser } from "./auth";

// Discovery hint only. The API checks the current account, scope and policy on
// every start; execution grants never grant namespace membership themselves.
export function canExecuteWindowsCommand(user: AuthUser | null, namespace: string, name: string, now = Date.now()): boolean {
  if (!user?.executionCredentialBound || user.mustChangePassword) return false;
  if (user.role === "admin") return true;
  if (user.personalNamespace !== namespace && !user.namespaces?.includes(namespace)) return false;
  const permissions = new Set(user.executionGrants?.filter((grant) => (
    grant.namespace === namespace
    && (!grant.workspaces?.length || grant.workspaces.includes(name))
    && (!grant.expiresAt || Date.parse(grant.expiresAt) > now)
  )).flatMap((grant) => grant.permissions));
  return permissions.has("workspace.exec") && permissions.has("workspace.exec.elevated");
}

export function decodeExecutionOutput(value?: string): string {
  if (!value) return "";
  return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
}
