"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { DisplayMode, ResolutionPolicy } from "@/lib/agent-protocol";
import { resolutionChoices } from "@/lib/agent-protocol";

export default function GuestResolutionControl({ actual, modes, policy, unavailable, note, onChange }: {
  actual: DisplayMode | null;
  modes: DisplayMode[];
  policy: ResolutionPolicy;
  unavailable: string | null;
  note: string | null;
  onChange: (policy: ResolutionPolicy) => void;
}) {
  const label = actual ? `Guest mode ${actual.width}×${actual.height}` : "Guest mode —";
  const choices = resolutionChoices(modes);
  const supported = choices.filter((m) => m.advertised);
  const additional = choices.filter((m) => !m.advertised);
  const reason = unavailable;
  return <span className="inline-flex items-center gap-2">
    {reason ? <button disabled title={reason} aria-label={`${label}. ${reason}`} className="text-[11px] text-gray-500 cursor-not-allowed">{label}</button> : (
      <details className="relative">
        <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-200" title="Change the guest's physical display resolution">{label} · {policy === "auto" ? "Auto" : "Fixed"} ▾</summary>
        <div className="absolute bottom-full right-0 mb-1 w-64 bg-[#1a1b26] border border-gray-700 rounded p-3 shadow-2xl z-50">
          <label className="flex flex-col gap-2 text-xs text-gray-300">
            Guest display resolution
            <select className="bg-gray-900 text-gray-200 rounded p-1" value={policy === "auto" ? "auto" : `${policy.width}x${policy.height}`} onChange={(event) => {
              const choice = choices.find((m) => `${m.width}x${m.height}` === event.target.value);
              onChange(choice ?? "auto");
              const details = event.currentTarget.closest("details");
              if (details) details.open = false;
            }}>
              <option value="auto">Automatic — closest guest mode</option>
              {policy !== "auto" && !choices.some((m) => m.width === policy.width && m.height === policy.height) && <option disabled value={`${policy.width}x${policy.height}`}>{policy.width} × {policy.height} (unavailable)</option>}
              {supported.length > 0 && <optgroup label="Guest-supported modes">
                {supported.map((m) => <option key={`${m.width}x${m.height}`} value={`${m.width}x${m.height}`}>{m.width} × {m.height}</option>)}
              </optgroup>}
              {additional.length > 0 && <optgroup label="Additional presets — guest validates">
                {additional.map((m) => <option key={`${m.width}x${m.height}`} value={`${m.width}x${m.height}`}>{m.width} × {m.height}</option>)}
              </optgroup>}
            </select>
          </label>
          <p className="mt-2 text-[11px] text-gray-500">A fixed mode stays selected when this window resizes. The guest view scales to fit.</p>
          <p className="mt-1 text-[11px] text-gray-500">Automatic chooses the closest supported mode. Additional presets may be rejected by the guest display driver.</p>
        </div>
      </details>
    )}
    {note && <span role="status" className="text-[11px] text-gray-400">{note}</span>}
  </span>;
}

// noVNC currently exposes automatic viewport resize, but no public mode-list
// or explicit-mode API. Report its delivered framebuffer honestly until that
// transport contract exists, without reaching into noVNC's private methods.
export function ConsoleResolutionStatus({ target, connected, observer, footerSlot = null }: {
  target: RefObject<HTMLDivElement | null>;
  connected: boolean;
  observer?: boolean;
  footerSlot?: HTMLElement | null;
}) {
  const [actual, setActual] = useState<DisplayMode | null>(null);
  useEffect(() => {
    const host = target.current;
    if (!host) return;
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      const canvas = host.querySelector("canvas");
      const size = connected && canvas && canvas.width > 0 && canvas.height > 0 ? { width: canvas.width, height: canvas.height } : null;
      setActual((previous) => previous?.width === size?.width && previous?.height === size?.height ? previous : size);
    };
    const changes = new MutationObserver(refresh);
    changes.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height"] });
    queueMicrotask(refresh);
    return () => { cancelled = true; changes.disconnect(); };
  }, [target, connected]);
  const control = <GuestResolutionControl actual={actual} modes={[]} policy="auto" note={null} onChange={() => {}}
    unavailable={observer ? "View-only: only the active controller can change guest resolution" : "This console transport does not expose selectable guest modes. Use guest display settings or automatic viewport resize."} />;
  return footerSlot ? createPortal(control, footerSlot) : <div className="absolute bottom-3 right-3 z-10 bg-black/50 rounded px-2 py-1">{control}</div>;
}
