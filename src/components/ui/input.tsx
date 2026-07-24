"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error state styling */
  error?: boolean;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const baseInputClasses = [
  "block w-full rounded-lg",
  "border border-[var(--color-border)]",
  "bg-[var(--color-surface)] text-[var(--color-text)]",
  "text-sm px-3 py-2",
  "placeholder:text-[var(--color-text-muted)]",
  "focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-muted)]",
  "transition-colors duration-150",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

const errorClasses = "border-red-400 focus:border-red-500 focus:ring-red-500/20";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`${baseInputClasses} ${error ? errorClasses : ""} ${className}`.trim()}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error = false, className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`${baseInputClasses} ${error ? errorClasses : ""} ${className}`.trim()}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error = false, className = "", children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`${baseInputClasses} ${error ? errorClasses : ""} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = "Select";

/** Label component for form fields */
export function Label({ className = "", children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`block text-xs font-medium text-[var(--color-text-secondary)] ${className}`.trim()}
      {...props}
    >
      {children}
    </label>
  );
}
