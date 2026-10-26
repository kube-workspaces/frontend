import { describe, expect, it } from "vitest";
import { canExecuteElevatedCommand as canExecute, decodeExecutionOutput, validateLinuxScript, linuxScriptInterpreter } from "@/lib/execution";
import type { AuthUser } from "@/lib/auth";

const user: AuthUser = {
  email: "operator@example.com", role: "viewer", executionCredentialBound: true,
  namespaces: ["demo"], executionGrants: [
    { namespace: "demo", workspaces: ["windows-vm"], permissions: ["workspace.exec"] },
    { namespace: "demo", permissions: ["workspace.exec.elevated"], expiresAt: "2026-10-21T00:00:00Z" },
  ],
};
const now = Date.parse("2026-10-20T00:00:00Z");

describe("elevated command discovery", () => {
  it("requires current credentials even for admins", () => {
    expect(canExecute(null, "demo", "windows-vm", now)).toBe(false);
    expect(canExecute({ ...user, role: "admin", executionCredentialBound: false }, "demo", "windows-vm", now)).toBe(false);
    expect(canExecute({ ...user, role: "admin" }, "other", "other", now)).toBe(true);
  });
  it("adds matching grants but never widens namespace/workspace scope", () => {
    expect(canExecute(user, "demo", "windows-vm", now)).toBe(true);
    expect(canExecute(user, "demo", "other", now)).toBe(false);
    expect(canExecute({ ...user, namespaces: [] }, "demo", "windows-vm", now)).toBe(false);
    expect(canExecute({ ...user, namespaces: [], personalNamespace: "demo" }, "demo", "windows-vm", now)).toBe(true);
    expect(canExecute(user, "other", "windows-vm", now)).toBe(false);
  });
  it("does not treat shell permission, expiry or mandatory password changes as execution authority", () => {
    expect(canExecute(user, "demo", "windows-vm", Date.parse("2026-10-21T00:00:00Z"))).toBe(false);
    expect(canExecute({ ...user, mustChangePassword: true }, "demo", "windows-vm", now)).toBe(false);
    expect(canExecute({ ...user, executionGrants: [{ namespace: "demo", permissions: ["workspace.shell", "workspace.exec.elevated"] }] }, "demo", "windows-vm", now)).toBe(false);
  });
  it("decodes base64 as UTF-8 rather than Latin-1", () => {
    expect(decodeExecutionOutput("aMOpbGxvIOKckw==")).toBe("héllo ✓");
  });
});

describe("Linux script contract", () => {
  it("uses only fixed absolute shebangs", () => {
    for (const interpreter of ["/bin/sh", "/bin/bash", "/usr/bin/bash", "/usr/bin/python3"]) {
      const body = `#!${interpreter}\necho hi\n`;
      expect(linuxScriptInterpreter(body)).toBe(interpreter);
      expect(() => validateLinuxScript(body, "run.sh", "/tmp")).not.toThrow();
    }
    for (const body of ["", "#!/usr/bin/env bash\n", "#!/bin/sh -e\n", "#!/bin/sh\r\n", "__proto__", "toString", "#!/bin/sh\nx\0"]) {
      expect(() => validateLinuxScript(body, "", "")).toThrow();
    }
  });
  it("counts UTF-8 bytes and rejects unsafe basename hints or cwd", () => {
    const prefix = "#!/bin/sh\n";
    expect(() => validateLinuxScript(prefix + "x".repeat(65536 - prefix.length), "", "")).not.toThrow();
    expect(() => validateLinuxScript(prefix + "é".repeat(32764), "", "")).toThrow();
    for (const name of ["..", ".", "../run.sh", "a\\b", "a:b", " padded ", "a".repeat(129)]) {
      expect(() => validateLinuxScript(prefix, name, "")).toThrow();
    }
    for (const cwd of [" /tmp", "/tmp\n", "é".repeat(513)]) {
      expect(() => validateLinuxScript(prefix, "", cwd)).toThrow();
    }
  });
});
