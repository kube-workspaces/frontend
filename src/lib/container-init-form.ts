import type { ContainerInitMode, WorkspaceContainerInit, WorkspaceImage } from "./api";

export interface ContainerInitForm {
  mode: "inherit" | ContainerInitMode;
  source: "catalog" | "inline" | "secret";
  userData: string;
  secret: string;
  defaultUser: string;
  runAsUser: string;
}

export function initialContainerInitForm(image?: WorkspaceImage | null): ContainerInitForm {
  return {
    mode: "inherit", source: image?.default_user_data ? "catalog" : "inline",
    userData: image?.default_user_data || "#cloud-config\nruncmd: []\n", secret: "",
    defaultUser: image?.default_container_init?.default_user || "",
    runAsUser: image?.default_container_init?.run_as_user || "",
  };
}

// Resolve/validate before creating any dependent volumes. Omitted input preserves
// catalog defaults; an explicit empty identity clears its inherited value.
export function containerInitOverride(form: ContainerInitForm, image: WorkspaceImage | null, command?: string[]): WorkspaceContainerInit | undefined {
  if (form.mode === "inherit") {
    if (image?.default_container_init?.mode === "injected" && !command?.length && !image.default_command?.length) {
      throw new Error("Injected initialization requires an application command (JSON argv).");
    }
    return undefined;
  }
  if (form.mode === "disabled") return { mode: "disabled" };
  if (form.mode === "injected" && !command?.length && !image?.default_command?.length) {
    throw new Error("Injected initialization requires an application command (JSON argv).");
  }
  const result: WorkspaceContainerInit = { mode: form.mode };
  if (form.source === "catalog") {
    if (!image?.default_user_data) throw new Error("The selected image has no default user-data. Choose inline cloud-config or a Secret.");
  } else if (form.source === "inline") {
    if (!/^#cloud-config(?:\r?\n|$)/.test(form.userData)) throw new Error("Inline user-data must begin with #cloud-config.");
    if (new TextEncoder().encode(form.userData).length > 262144) throw new Error("Inline user-data exceeds 256 KiB.");
    result.user_data = form.userData;
  } else {
    const name = form.secret.trim();
    if (name.length > 253 || !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*$/.test(name)) {
      throw new Error("Enter a valid same-namespace Secret name containing a user-data key.");
    }
    result.user_data_secret = name;
  }
  for (const name of [form.defaultUser, form.runAsUser]) {
    if (name && !/^[a-z_][a-z0-9_-]{0,31}$/.test(name)) throw new Error("Initialization identities must be valid Linux account names.");
  }
  if (form.mode === "injected") {
    if (form.runAsUser === "root") throw new Error("The application run-as account must be non-root.");
    result.default_user = form.defaultUser;
    result.run_as_user = form.runAsUser;
  } else {
    // Baked-in images own their entrypoint and identity selection.
    result.default_user = "";
    result.run_as_user = "";
  }
  return result;
}
