"use client";

import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "icon" | "text";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** If true, uses a gradient background for the primary variant */
  gradient?: boolean;
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: "px-2.5 py-1 text-xs",
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "font-medium rounded-lg text-[var(--color-primary-foreground)]",
    "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)]",
    "shadow-sm shadow-[var(--shadow-primary)]",
    "hover:-translate-y-[0.5px] active:translate-y-0",
    "transition-all duration-150",
    "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none",
  ].join(" "),
  secondary: [
    "font-medium rounded-lg",
    "border border-[var(--color-border)] text-[var(--color-text-secondary)]",
    "bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]",
    "hover:-translate-y-[0.5px] active:translate-y-0",
    "transition-all duration-150",
    "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
  ].join(" "),
  ghost: [
    "font-medium rounded-lg",
    "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
    "hover:bg-[var(--color-surface-hover)]",
    "transition-all duration-150",
    "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  destructive: [
    "font-medium rounded-lg text-white",
    "bg-red-600 hover:bg-red-700 active:bg-red-800",
    "shadow-sm shadow-red-500/20",
    "hover:-translate-y-[0.5px] active:translate-y-0",
    "transition-all duration-150",
    "focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none",
  ].join(" "),
  icon: [
    "rounded-lg p-1.5",
    "text-[var(--color-text-muted)] hover:text-[var(--color-primary)]",
    "hover:bg-[var(--color-primary-subtle)]",
    "transition-all duration-150",
    "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  text: [
    "font-medium",
    "text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]",
    "transition-colors duration-150",
    "focus:outline-none focus:underline",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "sm", gradient = false, className = "", children, ...props }, ref) => {
    const baseClasses = variantClasses[variant];
    const sizeClass = variant === "icon" ? "" : sizeClasses[size];
    const gradientClass = gradient && variant === "primary" ? "btn-primary-gradient" : "";

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${sizeClass} ${gradientClass} ${className}`.trim()}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
