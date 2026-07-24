"use client";

import { forwardRef } from "react";

type BadgeVariant = "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "outline";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Adds a small dot indicator before the text */
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  primary: "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]",
  success: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  neutral: "bg-[var(--color-surface-inset)] text-[var(--color-text-secondary)]",
  outline: "border border-[var(--color-border)] text-[var(--color-text-secondary)]",
};

const dotColors: Record<BadgeVariant, string> = {
  primary: "bg-[var(--color-primary)]",
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-purple-500",
  neutral: "bg-[var(--color-text-muted)]",
  outline: "bg-[var(--color-text-muted)]",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", dot = false, className = "", children, ...props }, ref) => {
    const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium";

    return (
      <span
        ref={ref}
        className={`${base} ${variantClasses[variant]} ${className}`.trim()}
        {...props}
      >
        {dot && (
          <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
