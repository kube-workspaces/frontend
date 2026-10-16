"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  checkTier1InUse,
  checkVNCConsoleInUse,
  getDisplayStatus,
  takeOverTier1,
  takeOverVNCConsole,
  type DisplayStatus,
} from "@/lib/api";

// Sessions panel for one VM workspace: which display seats are held and
// who watches the shared display. The desktop client has a session
// switcher; the web had nothing — every "held by another session" was a
// dead end with no way to see the holder. This polls the same status
// endpoints the viewers pre-check, and its actions reuse the consented
// takeover paths (no new API). Leases carry opaque holder IDs, so the
// panel reports state, never attribution: it cannot tell your other tab
// from someone else's session.
type SeatState = "held" | "free" | "unknown";

export default function WorkspaceSessions({ name, namespace }: { name: string; namespace: string }) {
  const [tier1, setTier1] = useState<SeatState>("unknown");
  const [vnc, setVnc] = useState<SeatState>("unknown");
  const [display, setDisplay] = useState<DisplayStatus | null>(null);
  const [confirm, setConfirm] = useState<"tier1" | "vnc" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const held = await checkTier1InUse(name, namespace);
        if (!cancelled) setTier1(held ? "held" : "free");
      } catch {
        if (!cancelled) setTier1("unknown");
      }
      try {
        const held = await checkVNCConsoleInUse(name, namespace);
        if (!cancelled) setVnc(held ? "held" : "free");
      } catch {
        if (!cancelled) setVnc("unknown");
      }
      try {
        const st = await getDisplayStatus(name, namespace);
        if (!cancelled) setDisplay(st);
      } catch {
        if (!cancelled) setDisplay(null);
      }
    };
    refresh().catch(() => {});
    const timer = window.setInterval(() => {
      refresh().catch(() => {});
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [name, namespace]);

  const takeOver = async (seat: "tier1" | "vnc") => {
    setBusy(true);
    setError("");
    try {
      if (seat === "tier1") await takeOverTier1(name, namespace);
      else await takeOverVNCConsole(name, namespace);
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Take over failed");
    } finally {
      setBusy(false);
    }
  };

  const dot = (state: SeatState) =>
    state === "held" ? "bg-amber-500" : state === "free" ? "bg-green-500" : "bg-gray-500";
  const label = (state: SeatState) => (state === "held" ? "Held" : state === "free" ? "Free" : "Unknown");
  const displayURL = `/workspaces/${name}/console?namespace=${namespace}`;
  const popoutURL = `/workspaces/${name}/popout?namespace=${namespace}`;

  const seatRow = (
    title: string,
    hint: string,
    state: SeatState,
    seat: "tier1" | "vnc",
    openURL: string,
    openLabel: string
  ) => (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot(state)}`} />
        <div className="min-w-0">
          <p className="text-gray-900 dark:text-white">
            {title} <span className="text-gray-500 dark:text-gray-400">· {label(state)}</span>
          </p>
          <p className="text-gray-500 dark:text-gray-400 truncate">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {state === "held" &&
          (confirm === seat ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void takeOver(seat)}
                className="text-rose-600 dark:text-rose-400 disabled:opacity-50"
              >
                {busy ? "Taking over…" : "Confirm"}
              </button>
              <button type="button" onClick={() => setConfirm(null)} className="text-gray-500 dark:text-gray-400">
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(seat)} className="text-[var(--color-primary)]">
              Take over
            </button>
          ))}
        <Link href={openURL} className="text-[var(--color-primary)]">
          {openLabel}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 p-3 text-xs">
      <p className="font-medium text-gray-900 dark:text-white">Sessions</p>
      <p className="mt-1 text-gray-500 dark:text-gray-400">
        Who holds this workspace right now. Seats are exclusive; take over asks first and demotes the holder.
        Holder identities are opaque to the web, so this shows state, not names.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
        {seatRow(
          "Premium display",
          "Exclusive agent stream (one controller)",
          tier1,
          "tier1",
          displayURL,
          "Open"
        )}
        {seatRow(
          "Console",
          "Exclusive VNC seat (one session)",
          vnc,
          "vnc",
          displayURL,
          "Open"
        )}
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0 bg-sky-500" />
            <div className="min-w-0">
              <p className="text-gray-900 dark:text-white">
                Shared observers{" "}
                <span className="text-gray-500 dark:text-gray-400">
                  · {display ? `${display.participants} watching` : "Unknown"}
                  {display?.controller ? " · controlled" : ""}
                </span>
              </p>
              <p className="text-gray-500 dark:text-gray-400 truncate">
                {display && display.observers.length > 0
                  ? display.observers
                      .map((o) => `${o.id.slice(0, 8)}${o.connected ? "" : " (idle)"}`)
                      .join(", ")
                  : "View-only mirror of the console framebuffer, not the premium stream"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={popoutURL} target="_blank" rel="noopener" className="text-[var(--color-primary)]">
              Observe
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
