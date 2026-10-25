"use client";

import { useEffect, useRef, useState } from "react";
import { ExecutionStartError, getExecutionStatus, startExecution, type ExecutionCommandResult, type ExecutionStatus, type Workspace } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canExecuteElevatedCommand, decodeExecutionOutput } from "@/lib/execution";

const fieldClass = "mt-1 block w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 p-2 font-mono text-xs disabled:opacity-50";

export default function WorkspaceExec({ workspace }: { workspace: Workspace }) {
  const { user, authEnabled, loading } = useAuth();
  const [open, setOpen] = useState(false);
  // Re-evaluate expiring grants even when workspace polling is paused.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const identity = workspace.execution_identity ?? (workspace.vm_profile === "windows11-amd64-v1" ? "SYSTEM" : undefined);
  if (loading || !authEnabled || workspace.type !== "vm" || !identity
    || !canExecuteElevatedCommand(user, workspace.namespace, workspace.name, now)) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} disabled={workspace.stopped}
      title={`Run a bounded command as ${identity}`}
      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-purple-400 disabled:opacity-50">
      <span aria-hidden="true" className="font-mono">&gt;_</span> Exec
    </button>
    {open && <ExecDialog workspace={workspace} onClose={() => setOpen(false)} />}
  </>;
}

function ExecDialog({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const linux = workspace.execution_identity === "root";
  const identity = linux ? "root" : "SYSTEM";
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusVersion, setStatusVersion] = useState(0);
  const [mode, setMode] = useState(linux ? "executable" : "powershell");
  const [command, setCommand] = useState("whoami");
  const [executable, setExecutable] = useState(linux ? "/usr/bin/id" : "C:\\Windows\\System32\\whoami.exe");
  const [args, setArgs] = useState("[]");
  const [cwd, setCwd] = useState("");
  const [deadline, setDeadline] = useState(20);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExecutionCommandResult | null>(null);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const next = await getExecutionStatus(controller.signal);
        if (!controller.signal.aborted) { setStatus(next); setStatusError(""); }
      } catch (err) {
        if (!controller.signal.aborted) { setStatus(null); setStatusError(err instanceof Error ? err.message : "Execution status unavailable"); }
      }
    })();
    return () => controller.abort();
  }, [statusVersion]);

  const unavailable = statusError || (!status ? "Checking execution policy and storage…"
    : !status.enabled ? "VM execution is disabled by platform policy."
    : !status.allow_elevated ? `${identity} execution is disabled by platform policy.`
    : !status.storage_available ? "Execution recording storage is unavailable."
    : workspace.stopped ? "Start the workspace before running a command." : "");

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || unavailable || uncertain) return;
    setError("");
    let argv: string[];
    try {
      const parsed: unknown = mode === "powershell" ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command] : JSON.parse(args);
      if (!Array.isArray(parsed) || !parsed.every((arg) => typeof arg === "string")) throw new Error("Arguments must be a JSON array of strings.");
      argv = parsed;
      if (argv.length > 64 || argv.some((arg) => new TextEncoder().encode(arg).length > 8192 || /\p{Cc}/u.test(arg))) {
        throw new Error("Use at most 64 arguments, each at most 8192 bytes and without control characters. PowerShell commands must be a single line.");
      }
    } catch (err) {
      setError(err instanceof SyntaxError ? "Arguments must be a JSON array of strings." : (err as Error).message);
      return;
    }
    submitting.current = true;
    setPending(true); setResult(null);
    try {
      const next = await startExecution({
        namespace: workspace.namespace, workspace_name: workspace.name,
        executable: mode === "powershell" ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" : executable,
        args: argv, ...(cwd ? { cwd } : {}), deadline_seconds: deadline,
      });
      setResult(next);
      if (next.outcome === "unknown" || next.state === "recording_lost") setUncertain(true);
    } catch (err) {
      const notDispatched = err instanceof ExecutionStartError && err.notDispatched;
      setError(`${err instanceof Error ? err.message : "Command response lost"}. ${notDispatched
        ? "The command was not dispatched."
        : "The command may have run; inspect execution history before submitting it again."}`);
      setUncertain(!notDispatched);
    } finally {
      submitting.current = false; setPending(false);
    }
  }

  function output(value?: string) {
    try { return decodeExecutionOutput(value) || "(empty)"; }
    catch { return "Output could not be decoded."; }
  }

  return <dialog ref={dialog} aria-labelledby="exec-title" onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
    className="m-auto max-h-[90vh] w-[min(48rem,95vw)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-900 shadow-xl backdrop:bg-black/50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
    <div className="flex items-center justify-between gap-3">
      <h2 id="exec-title" className="font-semibold">Exec — {workspace.name}</h2>
      <button type="button" onClick={onClose} disabled={pending} className="rounded px-2 py-1 text-xs disabled:opacity-50">Close</button>
    </div>
    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{workspace.namespace} · {linux ? "Linux" : "Windows"} · {identity} (elevated)</p>
    <p className="mt-2 text-xs">Run one command with a maximum 20-second deadline and 16 KiB combined output. This MVP has no interactive input or persistent shell.</p>
    {status && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Recording: {status.durable ? "durable" : "ephemeral — history is lost on API restart"} ({status.storage_mode}). Guest/runner readiness is checked when you run.</p>}
    {unavailable && <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-400">{unavailable}</p>}
    <button type="button" disabled={pending} onClick={() => { setStatus(null); setStatusError(""); setStatusVersion((v) => v + 1); }} className="mt-2 text-xs text-[var(--color-primary)]">Refresh availability</button>
    <form onSubmit={run} className="mt-4 space-y-3">
      <fieldset disabled={pending || uncertain} className="space-y-3 disabled:opacity-60">
        <label className="block text-xs">Mode<select className={fieldClass} value={mode} onChange={(event) => setMode(event.target.value)}>
          {!linux && <option value="powershell">PowerShell command</option>}<option value="executable">Executable + arguments</option>
        </select></label>
        {mode === "powershell" ? <label className="block text-xs">PowerShell command<input required value={command} onChange={(event) => setCommand(event.target.value)} className={fieldClass} autoComplete="off" spellCheck={false} /></label> : <>
          <label className="block text-xs">Executable<input required maxLength={1024} value={executable} onChange={(event) => setExecutable(event.target.value)} className={fieldClass} autoComplete="off" spellCheck={false} /></label>
          <label className="block text-xs">Arguments (JSON array)<textarea required value={args} onChange={(event) => setArgs(event.target.value)} className={fieldClass} rows={3} spellCheck={false} /></label>
        </>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs">Working directory (optional)<input maxLength={1024} value={cwd} onChange={(event) => setCwd(event.target.value)} className={fieldClass} autoComplete="off" spellCheck={false} /></label>
          <label className="block text-xs">Deadline (seconds)<input type="number" required min={1} max={20} value={deadline} onChange={(event) => setDeadline(Number(event.target.value))} className={fieldClass} /></label>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={pending || !!unavailable || uncertain} className="rounded bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{pending ? `Running as ${identity}…` : `Run as ${identity}`}</button>
      {pending && <p role="status" className="text-xs">Waiting for the recorded result. Closing the page does not cancel the command.</p>}
    </form>
    {result && <section aria-label="Command result" className="mt-4 space-y-2 border-t border-gray-200 pt-3 text-xs dark:border-gray-700">
      <p role="status" className="font-medium">State: {result.state} · Outcome: {result.outcome}{result.exit_code !== undefined ? ` · Exit code: ${result.exit_code}` : ""}{result.duration_ms !== undefined ? ` · ${result.duration_ms} ms` : ""}</p>
      <p className="break-all font-mono">Execution: {result.execution_id}<br />Recording: {result.recording_id}</p>
      <p>Recording: {result.durability === "durable" ? "durable" : result.durability === "none" ? "ephemeral" : "not reported"}</p>
      {result.denial && <p role="alert" className="text-red-600 dark:text-red-400">{result.denial}</p>}
      {uncertain && <p role="alert" className="text-amber-700 dark:text-amber-400">Outcome or recording is uncertain. Do not rerun this command; inspect execution history first.</p>}
      {result.truncated && <p className="text-amber-700 dark:text-amber-400">Output truncated at the 16 KiB combined limit.</p>}
      <h3 className="font-medium">Standard output</h3><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-100 p-3 dark:bg-gray-950">{output(result.stdout)}</pre>
      <h3 className="font-medium">Standard error</h3><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-100 p-3 dark:bg-gray-950">{output(result.stderr)}</pre>
    </section>}
  </dialog>;
}
