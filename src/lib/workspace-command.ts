// An empty override preserves catalog/OCI startup. JSON argv keeps shell source,
// spaces and empty arguments intact instead of interpreting shell quoting.
export function parseWorkspaceCommand(value: string): string[] | undefined {
  if (!value.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Command override must be a JSON argv array, e.g. ["sleep","infinity"].');
  }
  if (!Array.isArray(parsed) || parsed.length === 0 ||
      parsed.some((arg) => typeof arg !== "string" || arg.includes("\0")) || parsed[0] === "") {
    throw new Error("Command override must contain a nonempty executable followed by string arguments.");
  }
  return parsed as string[];
}
