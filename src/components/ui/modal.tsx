"use client";

import { forwardRef, useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Maximum width of the modal */
  size?: "sm" | "md" | "lg" | "xl";
  /** Title shown in the modal header */
  title?: string;
  /** Whether clicking the backdrop closes the modal */
  closeOnBackdrop?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ open, onClose, children, size = "md", title, closeOnBackdrop = true }, ref) => {
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEsc);
        document.body.style.overflow = "";
      };
    }, [open, onClose]);

    if (!open) return null;

    return (
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (closeOnBackdrop && e.target === overlayRef.current) onClose();
        }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

        {/* Modal content */}
        <div
          ref={ref}
          className={`relative w-full ${sizeClasses[size]} mx-4 flex flex-col max-h-[85vh]
            bg-[var(--color-surface-elevated)] border border-[var(--color-border)]
            rounded-xl shadow-xl shadow-[var(--shadow-elevation)]
            animate-in fade-in zoom-in-95 duration-200`}
        >
          {title && (
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)]">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    );
  }
);

Modal.displayName = "Modal";

/** Modal body section with standard padding */
export function ModalBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`.trim()}>{children}</div>;
}

/** Modal footer with action buttons */
export function ModalFooter({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--color-border-subtle)] ${className}`.trim()}>
      {children}
    </div>
  );
}
