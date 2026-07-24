"use client";

import { forwardRef } from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onChange, disabled = false, size = "sm", label, className = "" }, ref) => {
    const trackSize = size === "sm" ? "h-5 w-9" : "h-6 w-11";
    const thumbSize = size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5";
    const thumbTranslate = size === "sm"
      ? (checked ? "translate-x-[18px]" : "translate-x-[3px]")
      : (checked ? "translate-x-[22px]" : "translate-x-[3px]");

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex items-center rounded-full
          ${trackSize}
          ${checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `.trim()}
      >
        <span
          className={`
            inline-block ${thumbSize} rounded-full bg-white shadow-sm
            transform transition-transform duration-200
            ${thumbTranslate}
          `.trim()}
        />
      </button>
    );
  }
);

Toggle.displayName = "Toggle";
