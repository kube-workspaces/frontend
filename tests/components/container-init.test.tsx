import { describe, expect, it } from "vitest";
import { containerInitOverride, initialContainerInitForm } from "@/lib/container-init-form";
import { parseWorkspaceArgs } from "@/lib/workspace-command";
import type { WorkspaceImage } from "@/lib/api";

const image: WorkspaceImage = { cr_name: "demo", name: "Demo", image: "alpine:3.22", default_port: 80,
  default_command: ["sleep"], default_user_data: "#cloud-config\nruncmd: []\n",
  default_container_init: { mode: "injected", default_user: "developer", run_as_user: "app" } };

describe("initialization form payload", () => {
  it("preserves image defaults until explicitly overridden and clears identities explicitly", () => {
    const form = initialContainerInitForm(image);
    expect(containerInitOverride(form, image)).toBeUndefined();
    expect(containerInitOverride({ ...form, mode: "injected", runAsUser: "" }, image)).toEqual({ mode: "injected", default_user: "developer", run_as_user: "" });
    expect(containerInitOverride({ ...form, mode: "disabled" }, image)).toEqual({ mode: "disabled" });
    expect(containerInitOverride({ ...form, mode: "baked-in" }, image)).toEqual({ mode: "baked-in", default_user: "", run_as_user: "" });
  });
  it("makes data sources exclusive and validates before resource creation", () => {
    const form = { ...initialContainerInitForm(image), mode: "injected" as const };
    expect(containerInitOverride({ ...form, source: "secret", secret: "private-init" }, image)).toEqual({ mode: "injected", user_data_secret: "private-init", default_user: "developer", run_as_user: "app" });
    expect(() => containerInitOverride({ ...form, source: "secret", secret: "Invalid_Name" }, image)).toThrow(/Secret name/);
    expect(() => containerInitOverride({ ...form, source: "inline", userData: "invalid" }, image)).toThrow(/#cloud-config/);
    expect(() => containerInitOverride({ ...form, source: "inline", userData: "#cloud-config\n#" + "é".repeat(131072) }, image)).toThrow(/256 KiB/);
    expect(() => containerInitOverride({ ...form, runAsUser: "root" }, image)).toThrow(/non-root/);
    expect(() => containerInitOverride(form, { ...image, default_command: [] })).toThrow(/application command/);
  });
  it("preserves empty args and literal argv, with explicit [] clearing defaults", () => {
    expect(parseWorkspaceArgs("")).toBeUndefined();
    expect(parseWorkspaceArgs("[]")).toEqual([]);
    expect(parseWorkspaceArgs('["a b","","$HOME"]')).toEqual(["a b", "", "$HOME"]);
    for (const invalid of ["sleep infinity", '[1]', '["\\u0000"]']) expect(() => parseWorkspaceArgs(invalid)).toThrow();
  });
});
