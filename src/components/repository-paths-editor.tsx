"use client";

import { useId } from "react";

export function normalizeRepositoryPaths(paths: string[]): string[] {
  const normalized = paths.map((path) => path.trim().replace(/\/+$/, "")).filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : ["images"];
}

export default function RepositoryPathsEditor({
  paths,
  onChange,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Paths</legend>
      <p id={`${id}-help`} className="text-xs text-gray-500 dark:text-gray-400">
        One folder per row, relative to the repository root. Only files directly in each folder are synced;
        add subfolders separately. A trailing / is optional.
      </p>
      {paths.map((path, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            aria-label={`Repository path ${index + 1}`}
            aria-describedby={`${id}-help`}
            value={path}
            onChange={(event) => onChange(paths.map((value, i) => i === index ? event.target.value : value))}
            placeholder="images"
            className="min-w-0 flex-1 px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
          />
          <button
            type="button"
            aria-label={`Remove path ${index + 1}`}
            title="Remove path"
            onClick={() => onChange(paths.filter((_, i) => i !== index))}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-300 dark:border-gray-700 text-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            −
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...paths, ""])}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <span aria-hidden="true">+</span> Add path
      </button>
      {paths.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Defaults to images when no paths are specified.</p>}
    </fieldset>
  );
}
