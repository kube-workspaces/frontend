"use client";

import { useId, useState, type ReactNode } from "react";
import type { WorkspaceImage } from "@/lib/api";
import {
  emptyImageFilters, filterImages, imageFacetOptions, repositoryLabel,
  type ImageFacet, type ImageFilters,
} from "@/lib/image-filters";

const storageKey = "images-filters-v2";
const fieldClass = "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] dark:border-gray-700 dark:bg-gray-900 dark:text-white";
const facetLabels: Record<ImageFacet, string> = { categories: "Categories", repositories: "Source repositories", tags: "Tags" };
const chipLabels: Record<ImageFacet, string> = { categories: "Category", repositories: "Repository", tags: "Tag" };

function readFilters(): ImageFilters {
  if (typeof window === "undefined") return emptyImageFilters;
  try {
    const stored = localStorage.getItem(storageKey);
    const data = stored ? JSON.parse(stored) : {
      categories: [localStorage.getItem("images-category-filter")].filter(Boolean),
      tags: JSON.parse(localStorage.getItem("images-tags-filter") || "[]"),
    };
    const strings = (value: unknown): string[] => Array.isArray(value) ? Array.from(new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))) : [];
    return {
      search: typeof data.search === "string" ? data.search : "",
      categories: strings(data.categories), tags: strings(data.tags), repositories: strings(data.repositories),
      tagMatch: data.tagMatch === "any" ? "any" : "all",
    };
  } catch { return emptyImageFilters; }
}

export default function ImageCatalog({ images, controls, onAdd, children }: {
  images: WorkspaceImage[];
  controls: ReactNode;
  onAdd: () => void;
  children: (images: WorkspaceImage[]) => ReactNode;
}) {
  const [filters, setFilters] = useState(readFilters);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sort, setSort] = useState("name-asc");
  const panelId = useId();
  const updateFilters = (next: ImageFilters) => {
    setFilters(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Filtering also works without browser storage. */ }
  };
  const toggle = (facet: ImageFacet, value: string) => updateFilters({
    ...filters, [facet]: filters[facet].includes(value) ? filters[facet].filter(item => item !== value) : [...filters[facet], value],
  });
  const selectedCount = filters.categories.length + filters.tags.length + filters.repositories.length;
  const hasFilters = selectedCount > 0 || filters.search.length > 0;
  const filtered = filterImages(images, filters).sort((a, b) => {
    const order = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) || a.cr_name.localeCompare(b.cr_name);
    return sort === "name-desc" ? -order : order;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search images</span>
          <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input type="search" value={filters.search} onChange={e => updateFilters({ ...filters, search: e.target.value })}
            placeholder="Search names, descriptions, tags or repositories…" className={`${fieldClass} pl-9`} />
        </label>
        <button type="button" aria-expanded={mobileFiltersOpen} aria-controls={panelId} onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300 lg:hidden">
          Filters{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside id={panelId} aria-label="Image filters" className={`${mobileFiltersOpen ? "block" : "hidden"} rounded-lg border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-900/40 lg:block`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Filters</h2>
            {hasFilters && <button onClick={() => updateFilters(emptyImageFilters)} className="text-xs font-medium text-[var(--color-primary)] hover:underline">Clear all</button>}
          </div>
          <p className="mb-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Combine filters to narrow your results. Select multiple categories or repositories to match any.</p>
          <div className="space-y-5 divide-y divide-gray-200 dark:divide-gray-800">
            {(["categories", "repositories", "tags"] as ImageFacet[]).map(facet => (
              <FacetFilter key={facet} facet={facet} options={imageFacetOptions(images, filters, facet)} selected={filters[facet]} onToggle={value => toggle(facet, value)}
                onClear={() => updateFilters({ ...filters, [facet]: [] })}>
                {facet === "tags" && <label className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                  Match tags
                  <select aria-label="Tag matching" value={filters.tagMatch} onChange={e => updateFilters({ ...filters, tagMatch: e.target.value as "any" | "all" })}
                    className="rounded border border-gray-200 bg-white p-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    <option value="all">All selected</option><option value="any">Any selected</option>
                  </select>
                </label>}
              </FacetFilter>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">Option counts match your search and the other filter groups. “Not recorded” means the image has no recorded repository origin.</p>
        </aside>
        <div className="min-w-0 space-y-4">
          {hasFilters && <div aria-label="Active filters" className="flex flex-wrap items-center gap-2">
            {filters.search && <FilterChip label={`Search: ${filters.search}`} onRemove={() => updateFilters({ ...filters, search: "" })} />}
            {(["categories", "repositories", "tags"] as ImageFacet[]).flatMap(facet => filters[facet].map(value => (
              <FilterChip key={`${facet}:${value}`} label={`${chipLabels[facet]}: ${facet === "repositories" ? repositoryLabel(value) : value}`} onRemove={() => toggle(facet, value)} />
            )))}
            <button onClick={() => updateFilters(emptyImageFilters)} className="px-1 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline">Clear all filters</button>
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">{filtered.length}</span> of {images.length} {images.length === 1 ? "image" : "images"}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">Sort by
                <select value={sort} onChange={e => setSort(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                  <option value="name-asc">Name: A–Z</option><option value="name-desc">Name: Z–A</option>
                </select>
              </label>
              {controls}
            </div>
          </div>
          {filtered.length ? children(filtered) : <div className="rounded-lg border border-dashed border-gray-300 px-6 py-14 text-center dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{hasFilters ? "No images match your filters" : "No images available"}</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{hasFilters ? "Try a broader search or remove a filter to see more images." : "Add an image to get started."}</p>
            <button onClick={() => hasFilters ? updateFilters(emptyImageFilters) : onAdd()} className="mt-4 rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white dark:bg-white dark:text-gray-900">
              {hasFilters ? "Clear all filters" : "+ Add Image"}
            </button>
          </div>}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <button onClick={onRemove} aria-label={`Remove ${label}`} className="inline-flex max-w-full items-center gap-2 rounded-full bg-[var(--color-primary-subtle)] px-2.5 py-1 text-xs text-[var(--color-primary)] hover:ring-1 hover:ring-current">
    <span className="truncate">{label}</span><span aria-hidden="true">×</span>
  </button>;
}

function FacetFilter({ facet, options, selected, onToggle, onClear, children }: {
  facet: ImageFacet;
  options: { value: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const label = facetLabels[facet];
  const visible = options.filter(option => (facet === "repositories" ? repositoryLabel(option.value) : option.value).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <fieldset className="min-w-0 pt-4 first:pt-0">
    <legend className="sr-only">{label}</legend>
    <div className="mb-2 flex items-center justify-between gap-2">
      <span aria-hidden="true" className="text-xs font-semibold text-gray-900 dark:text-white">{label}{selected.length > 0 && ` (${selected.length})`}</span>
      {selected.length > 0 && <button onClick={onClear} aria-label={`Clear ${label.toLowerCase()}`} className="text-xs text-[var(--color-primary)] hover:underline">Clear</button>}
    </div>
    {children}
    {options.length > 6 && <input type="search" aria-label={`Find ${label.toLowerCase()}`} placeholder={`Find ${label.toLowerCase()}…`} value={query} onChange={e => setQuery(e.target.value)} className={`${fieldClass} mb-2 px-2 py-1.5 text-xs`} />}
    <div className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain">
      {visible.map(({ value, count }) => <label key={value} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
        <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} className="mt-0.5 shrink-0 accent-[var(--color-primary)]" />
        <span className="min-w-0 flex-1 break-words">{facet === "repositories" ? repositoryLabel(value) : value}</span>{" "}
        <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500" aria-label={`${count} ${count === 1 ? "image" : "images"} matching other filters`}>{count}</span>
      </label>)}
      {visible.length === 0 && <p className="py-2 text-xs text-gray-500">{query ? "No matching options." : "No options available."}</p>}
    </div>
  </fieldset>;
}
