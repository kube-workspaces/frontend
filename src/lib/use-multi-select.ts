"use client";

import { useState, useCallback, useRef } from "react";

/**
 * useMultiSelect — provides shift-click range selection and ctrl/cmd-click
 * toggle selection for list UIs. Items are identified by string keys.
 *
 * Usage:
 *   const { selected, handleSelect, selectAll, clearSelection, isSelected } = useMultiSelect(orderedKeys);
 *   <tr onClick={(e) => handleSelect(key, e)} className={isSelected(key) ? "..." : ""}>
 */
export function useMultiSelect(orderedKeys: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);

  const isSelected = useCallback((key: string) => selected.has(key), [selected]);

  const handleSelect = useCallback(
    (key: string, e: React.MouseEvent) => {
      // Shift+click: range select from last clicked to current
      if (e.shiftKey && lastClickedRef.current !== null) {
        const lastIdx = orderedKeys.indexOf(lastClickedRef.current);
        const curIdx = orderedKeys.indexOf(key);
        if (lastIdx !== -1 && curIdx !== -1) {
          const start = Math.min(lastIdx, curIdx);
          const end = Math.max(lastIdx, curIdx);
          const range = orderedKeys.slice(start, end + 1);
          setSelected((prev) => {
            const next = new Set(prev);
            for (const k of range) next.add(k);
            return next;
          });
          lastClickedRef.current = key;
          return;
        }
      }

      // Ctrl/Cmd+click: toggle individual item
      if (e.ctrlKey || e.metaKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
        lastClickedRef.current = key;
        return;
      }

      // Plain click with no selection active: don't select (let normal navigation happen)
      // Plain click with selection active: set selection to just this item
      if (selected.size > 0) {
        if (selected.size === 1 && selected.has(key)) {
          // Clicking the only selected item deselects it
          setSelected(new Set());
          lastClickedRef.current = null;
        } else {
          setSelected(new Set([key]));
          lastClickedRef.current = key;
        }
        return;
      }

      // No modifier + no existing selection = no selection action (allow default behavior)
      return "passthrough" as const;
    },
    [orderedKeys, selected]
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(orderedKeys));
    lastClickedRef.current = orderedKeys[orderedKeys.length - 1] || null;
  }, [orderedKeys]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    lastClickedRef.current = null;
  }, []);

  return {
    selected,
    selectedCount: selected.size,
    isSelected,
    handleSelect,
    selectAll,
    clearSelection,
  };
}
