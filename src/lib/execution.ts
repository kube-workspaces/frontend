import type { AuthUser } from "./auth";

// Discovery hint only. The API checks the current account, scope and policy on
// every start; execution grants never grant namespace membership themselves.
export function canExecuteElevatedCommand(user: AuthUser | null, namespace: string, name: string, now = Date.now()): boolean {
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

const linuxInterpreters = new Map([
  ["#!/bin/sh", "/bin/sh"], ["#!/bin/bash", "/bin/bash"],
  ["#!/usr/bin/bash", "/usr/bin/bash"], ["#!/usr/bin/python3", "/usr/bin/python3"],
]);

export function linuxScriptInterpreter(body: string): string | undefined {
  return linuxInterpreters.get(body.split("\n", 1)[0]);
}

export function validateLinuxScript(body: string, name: string, cwd: string): void {
  validateScriptBounds(body, name, cwd);
  if (!linuxScriptInterpreter(body)) {
    throw new Error("Use an exact #!/bin/sh, #!/bin/bash, #!/usr/bin/bash or #!/usr/bin/python3 first line, without arguments or CRLF.");
  }
}

export function windowsScriptInterpreter(body: string): string | undefined {
  return body.split("\n", 1)[0].replace(/\r$/, "") === "#!powershell" ? "Windows PowerShell" : undefined;
}

export function validateWindowsScript(body: string, name: string, cwd: string): void {
  validateScriptBounds(body, name, cwd);
  if (!windowsScriptInterpreter(body)) throw new Error("Use an exact #!powershell first line; interpreter arguments and pwsh/env lookup are unsupported.");
}

function validateScriptBounds(body: string, name: string, cwd: string): void {
  if (!body || new TextEncoder().encode(body).length > 65536 || body.includes("\u0000")) {
    throw new Error("Script body must be 1–65536 UTF-8 bytes without null bytes.");
  }
  if (name && (name.length > 128 || !/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..")) {
    throw new Error("Filename hint must be a basename of at most 128 ASCII letters, digits, dots, underscores or hyphens (not . or ..).");
  }
  if (cwd && (new TextEncoder().encode(cwd).length > 1024 || cwd.trim() !== cwd || /\p{Cc}/u.test(cwd))) {
    throw new Error("Working directory must be at most 1024 UTF-8 bytes without padding or control characters.");
  }
}
