"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE } from "@/lib/api";

interface ModuleInfo {
  name: string;
  path: string;
  goVersion: string;
  module: string;
  description: string;
  packages: string[];
}

interface GodocIndex {
  generated: string;
  modules: ModuleInfo[];
}

export default function GodocPage() {
  const [index, setIndex] = useState<GodocIndex | null>(null);
  const [activeModule, setActiveModule] = useState<string>("controller");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the index
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/godoc`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to fetch godoc index: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setIndex(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load documentation index");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch module content
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/godoc/${activeModule}.md`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to fetch docs for ${activeModule}: ${res.status}`);
        const text = await res.text();
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load documentation");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeModule]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Go Documentation
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Auto-generated package documentation for the kube-workspaces Go modules.
          {index && (
            <span className="ml-2 text-xs">
              Last generated: {new Date(index.generated).toLocaleDateString()}
            </span>
          )}
        </p>
      </div>

      {/* Module tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
        {(index?.modules || []).map((mod) => (
          <button
            key={mod.path}
            onClick={() => setActiveModule(mod.path)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeModule === mod.path
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            <span>{mod.name}</span>
            <span className="ml-2 text-xs opacity-60">Go {mod.goVersion}</span>
          </button>
        ))}
      </div>

      {/* Module description */}
      {index && (
        <div className="mb-4 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <code className="text-xs text-gray-600 dark:text-gray-400">
                {index.modules.find((m) => m.path === activeModule)?.module}
              </code>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                {index.modules.find((m) => m.path === activeModule)?.description}
              </p>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {index.modules.find((m) => m.path === activeModule)?.packages.length} packages
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
        </div>
      )}

      {/* Content */}
      {!loading && !error && content && (
        <div className="godoc-content prose prose-sm dark:prose-invert max-w-none
          prose-headings:scroll-mt-20
          prose-h1:text-xl prose-h1:font-bold prose-h1:border-b prose-h1:border-gray-200 prose-h1:dark:border-gray-700 prose-h1:pb-2 prose-h1:mb-4
          prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-8
          prose-h3:text-base prose-h3:font-medium
          prose-code:text-xs prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-gray-50 prose-pre:dark:bg-gray-900 prose-pre:border prose-pre:border-gray-200 prose-pre:dark:border-gray-700 prose-pre:rounded-lg prose-pre:text-xs
          prose-a:text-[var(--color-primary)] prose-a:no-underline hover:prose-a:underline
          prose-table:text-xs
          prose-th:bg-gray-50 prose-th:dark:bg-gray-800
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
