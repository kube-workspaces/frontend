"use client";

import { forwardRef } from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a colored left border accent */
  accent?: "primary" | "success" | "warning" | "danger" | "info" | "none";
  /** Whether the card is interactive (adds hover state) */
  interactive?: boolean;
  /** Elevation level */
  elevation?: "flat" | "sm" | "md";
  /** Whether to use padding */
  padded?: boolean;
}

const accentClasses: Record<string, string> = {
  primary: "border-l-2 border-l-[var(--color-primary)]",
  success: "border-l-2 border-l-green-500",
  warning: "border-l-2 border-l-amber-500",
  danger: "border-l-2 border-l-red-500",
  info: "border-l-2 border-l-purple-500",
  none: "",
};

const elevationClasses: Record<string, string> = {
  flat: "",
  sm: "shadow-sm shadow-[var(--shadow-elevation)]",
  md: "shadow-md shadow-[var(--shadow-elevation)]",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ accent = "none", interactive = false, elevation = "flat", padded = true, className = "", children, ...props }, ref) => {
    const base = [
      "rounded-lg border border-[var(--color-border)]",
      "bg-[var(--color-surface)]",
      "transition-all duration-150",
    ].join(" ");

    const hoverClass = interactive
      ? "hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border)] hover:shadow-sm hover:shadow-[var(--shadow-elevation)] cursor-pointer"
      : "";

    const paddingClass = padded ? "p-4" : "";

    return (
      <div
        ref={ref}
        className={`${base} ${accentClasses[accent]} ${elevationClasses[elevation]} ${hoverClass} ${paddingClass} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
