"use client";

import { useEffect, useRef } from "react";
import { API_BASE } from "@/lib/api";

export default function AdminApiPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const script = document.createElement("script");
    script.src = "https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js";
    script.async = true;
    script.onload = () => {
      if (containerRef.current && (window as unknown as Record<string, unknown>).Redoc) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Redoc.init(
          `${API_BASE}/openapi3.json`,
          {
            theme: {
              colors: {
                primary: { main: "#2563eb" },
              },
              typography: {
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: "14px",
              },
              sidebar: {
                width: "260px",
              },
            },
            hideDownloadButton: false,
            expandResponses: "200",
            pathInMiddlePanel: true,
            scrollYOffset: 0,
            nativeScrollbars: true,
          },
          containerRef.current
        );
      }
    };
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          API Documentation
        </h1>
        <div className="flex items-center gap-2">
          <a
            href={`${API_BASE}/openapi3.json`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            JSON
          </a>
          <a
            href={`${API_BASE}/openapi3.yaml`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            YAML
          </a>
        </div>
      </div>
      <div
        ref={containerRef}
        className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden bg-white"
      />
    </div>
  );
}
