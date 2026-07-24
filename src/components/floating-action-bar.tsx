"use client";

import { useEffect, useRef, useState } from "react";

export interface ActionBarAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Tailwind color classes for the button */
  className?: string;
  /** Whether the action is currently possible */
  disabled?: boolean;
  /** Tooltip when disabled */
  disabledReason?: string;
}

interface FloatingActionBarProps {
  selectedCount: number;
  actions: ActionBarAction[];
  onSelectAll?: () => void;
  onClearSelection: () => void;
  totalCount?: number;
}

export function FloatingActionBar({
  selectedCount,
  actions,
  onSelectAll,
  onClearSelection,
  totalCount,
}: FloatingActionBarProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entrance animation: delay setting visible=true so the CSS transition plays
  useEffect(() => {
    let cancelled = false;
    if (selectedCount > 0) {
      timerRef.current = setTimeout(() => {
        if (!cancelled) setVisible(true);
      }, 10);
    }
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setVisible(false);
    };
  }, [selectedCount]);

  if (selectedCount === 0) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-200 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-gray-100 shadow-xl border border-gray-700 dark:border-gray-300">
        {/* Selection count */}
        <span className="text-sm font-medium text-white dark:text-gray-900 whitespace-nowrap">
          {selectedCount} selected
        </span>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-600 dark:bg-gray-400" />

        {/* Select all / clear */}
        <div className="flex items-center gap-1">
          {onSelectAll && totalCount && selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="px-2 py-1 text-xs font-medium text-gray-300 dark:text-gray-600 hover:text-white dark:hover:text-gray-900 transition-colors"
            >
              Select all ({totalCount})
            </button>
          )}
          <button
            onClick={onClearSelection}
            className="px-2 py-1 text-xs font-medium text-gray-300 dark:text-gray-600 hover:text-white dark:hover:text-gray-900 transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-600 dark:bg-gray-400" />

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.disabled ? action.disabledReason : action.label}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                action.disabled
                  ? "opacity-40 cursor-not-allowed text-gray-400 dark:text-gray-500"
                  : action.className || "text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300"
              }`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
