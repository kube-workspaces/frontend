import type { WorkspaceImage } from "@/lib/api";

export const UNRECORDED_REPOSITORY = "__unrecorded__";
export type ImageFacet = "categories" | "tags" | "repositories";
export interface ImageFilters {
  search: string;
  categories: string[];
  tags: string[];
  repositories: string[];
  tagMatch: "any" | "all";
}

export const emptyImageFilters: ImageFilters = {
  search: "", categories: [], tags: [], repositories: [], tagMatch: "all",
};

export function imageCategory(image: WorkspaceImage) {
  return image.category?.trim() || "Other";
}

export function imageRepository(image: WorkspaceImage) {
  return image.source_repository || UNRECORDED_REPOSITORY;
}

export function repositoryLabel(repository: string) {
  return repository === UNRECORDED_REPOSITORY ? "Not recorded" : repository;
}

export function filterImages(images: WorkspaceImage[], filters: ImageFilters, omit?: ImageFacet) {
  const words = filters.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return images.filter((image) => {
    if (omit !== "categories" && filters.categories.length && !filters.categories.includes(imageCategory(image))) return false;
    if (omit !== "repositories" && filters.repositories.length && !filters.repositories.includes(imageRepository(image))) return false;
    if (omit !== "tags" && filters.tags.length) {
      const matches = (tag: string) => image.tags?.includes(tag);
      if (filters.tagMatch === "all" ? !filters.tags.every(matches) : !filters.tags.some(matches)) return false;
    }
    const text = [image.name, image.cr_name, image.image, image.description, imageCategory(image),
      ...(image.tags || []), image.source_repository, image.source_repository_url].filter(Boolean).join(" ").toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}

export function imageFacetValues(image: WorkspaceImage, facet: ImageFacet): string[] {
  if (facet === "categories") return [imageCategory(image)];
  if (facet === "repositories") return [imageRepository(image)];
  return Array.from(new Set(image.tags || []));
}

// Counts respect the search and other facets, while keeping this facet's options visible.
export function imageFacetOptions(images: WorkspaceImage[], filters: ImageFilters, facet: ImageFacet) {
  const counts = new Map<string, number>();
  for (const image of filterImages(images, filters, facet)) {
    for (const value of imageFacetValues(image, facet)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  const values = new Set([...images.flatMap(image => imageFacetValues(image, facet)), ...filters[facet]]);
  return Array.from(values).sort((a, b) => a.localeCompare(b)).map(value => ({ value, count: counts.get(value) || 0 }));
}
