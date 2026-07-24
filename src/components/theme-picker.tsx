"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme, COLOR_THEMES, NAV_FONTS } from "@/lib/theme";

export function ThemePicker() {
  const { mode, colorTheme, navFont, toggleMode, setColorTheme, setNavFont } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
        title="Theme settings"
      >
        {mode === "dark" ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-lg shadow-[var(--shadow-elevation)] p-3 z-50">
          {/* Mode toggle */}
          <div className="mb-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Mode</p>
            <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--color-surface-inset)]">
              <button
                onClick={() => { if (mode === "dark") toggleMode(); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  mode === "light"
                    ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Light
              </button>
              <button
                onClick={() => { if (mode === "light") toggleMode(); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  mode === "dark"
                    ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                Dark
              </button>
            </div>
          </div>

          {/* Color theme */}
          <div className="mb-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Accent</p>
            <div className="flex gap-2">
              {COLOR_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setColorTheme(theme.id)}
                  className={`group flex flex-col items-center gap-1.5 flex-1 p-2 rounded-lg transition-all ${
                    colorTheme === theme.id
                      ? "bg-[var(--color-primary-subtle)] ring-1 ring-[var(--color-primary)]"
                      : "hover:bg-[var(--color-surface-hover)]"
                  }`}
                  title={theme.label}
                >
                  <span
                    className={`w-6 h-6 rounded-full shadow-sm transition-transform ${
                      colorTheme === theme.id ? "scale-110" : "group-hover:scale-105"
                    }`}
                    style={{ backgroundColor: theme.preview }}
                  />
                  <span className={`text-[10px] font-medium ${
                    colorTheme === theme.id ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
                  }`}>
                    {theme.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Nav font */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Nav Feel</p>
            <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--color-surface-inset)]">
              {NAV_FONTS.map((font) => (
                <button
                  key={font.id}
                  onClick={() => setNavFont(font.id)}
                  className={`flex-1 px-2 py-1.5 text-[10px] rounded-md transition-all ${
                    navFont === font.id
                      ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                  style={{ fontFamily: `var(${font.cssVar})` }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
