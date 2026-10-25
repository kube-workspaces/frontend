import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ImagesPage from "@/app/images/page";
import type { WorkspaceImage } from "@/lib/api";

const api = vi.hoisted(() => ({ listImages: vi.fn(), listWorkspaces: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock("@/lib/api", () => ({ ...api, createImage: vi.fn(), getImageCR: vi.fn() }));

const images: WorkspaceImage[] = [
  { cr_name: "code", name: "Code Studio", image: "ghcr.io/demo/code", default_port: 8080, category: "IDE", tags: ["linux", "development"], source_repository: "official" },
  { cr_name: "desktop", name: "Linux Desktop", image: "ghcr.io/demo/desktop", default_port: 6080, category: "Desktop", tags: ["linux", "browser"], source_repository: "community" },
  { cr_name: "notebook", name: "Notebook", image: "ghcr.io/demo/notebook", default_port: 8888, category: "IDE", tags: ["python", "development"], source_repository: "community" },
  { cr_name: "custom", name: "Custom Image", image: "ghcr.io/demo/custom", default_port: 8080 },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.listImages.mockResolvedValue(images);
  api.listWorkspaces.mockResolvedValue([]);
});

async function load() {
  render(<ImagesPage />);
  await screen.findByRole("heading", { name: "Available Images" });
}

function choose(group: string, value: string) {
  fireEvent.click(within(screen.getByRole("group", { name: group })).getByRole("checkbox", { name: new RegExp(`^${value} `) }));
}

it("combines categories, repository and text search and keeps the result count accurate across views", async () => {
  await load();
  expect(screen.getByRole("status")).toHaveTextContent("4 of 4 images");
  choose("Categories", "IDE");
  expect(screen.getByRole("status")).toHaveTextContent("2 of 4 images");
  choose("Source repositories", "community");
  expect(screen.getByRole("status")).toHaveTextContent("1 of 4 images");
  expect(screen.getByRole("link", { name: "Notebook" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Code Studio" })).not.toBeInTheDocument();
  choose("Categories", "Desktop");
  expect(screen.getByRole("status")).toHaveTextContent("2 of 4 images");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search images" }), { target: { value: "  LINUX community " } });
  expect(screen.getByRole("status")).toHaveTextContent("1 of 4 images");
  fireEvent.click(screen.getByRole("button", { name: "List view" }));
  expect(screen.getByRole("link", { name: "Linux Desktop" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Compact view" }));
  expect(screen.getByRole("status")).toHaveTextContent("1 of 4 images");
  expect(screen.getByRole("link", { name: "Linux Desktop" })).toBeInTheDocument();
});

it("makes any/all tag matching explicit and removes individual selections", async () => {
  await load();
  choose("Tags", "linux");
  choose("Tags", "development");
  expect(screen.getByRole("status")).toHaveTextContent("1 of 4 images");
  fireEvent.change(screen.getByRole("combobox", { name: "Tag matching" }), { target: { value: "any" } });
  expect(screen.getByRole("status")).toHaveTextContent("3 of 4 images");
  fireEvent.click(screen.getByRole("button", { name: "Remove Tag: linux" }));
  expect(screen.getByRole("status")).toHaveTextContent("2 of 4 images");
  fireEvent.click(screen.getByRole("button", { name: "Clear tags" }));
  expect(screen.getByRole("status")).toHaveTextContent("4 of 4 images");
});

it("keeps contextual counts and zero-result selections recoverable, including missing provenance", async () => {
  await load();
  choose("Categories", "IDE");
  const repos = within(screen.getByRole("group", { name: "Source repositories" }));
  expect(repos.getByRole("checkbox", { name: /^community / })).toHaveAccessibleName("community 1 image matching other filters");
  choose("Source repositories", "Not recorded");
  expect(screen.getByRole("status")).toHaveTextContent("0 of 4 images");
  expect(screen.getByRole("heading", { name: "No images match your filters" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove Category: IDE" }));
  expect(screen.getByRole("status")).toHaveTextContent("1 of 4 images");
  expect(screen.getByRole("link", { name: "Custom Image" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
  expect(screen.getByRole("status")).toHaveTextContent("4 of 4 images");
});

it("restores saved filters, migrates old selections and tolerates malformed storage", async () => {
  localStorage.setItem("images-category-filter", "IDE");
  localStorage.setItem("images-tags-filter", '["development"]');
  const view = render(<ImagesPage />);
  expect(await screen.findByRole("status")).toHaveTextContent("2 of 4 images");
  choose("Source repositories", "official");
  view.unmount();
  const restored = render(<ImagesPage />);
  expect(await screen.findByRole("status")).toHaveTextContent("1 of 4 images");
  restored.unmount();
  localStorage.setItem("images-filters-v2", '{"categories":null,"tags":"bad","repositories":42}');
  await load();
  expect(screen.getByRole("status")).toHaveTextContent("4 of 4 images");
});

it("searches long facet lists and preserves selected options when the inventory changes", async () => {
  const manyTags = Array.from({ length: 10 }, (_, index) => `tag-${index}`);
  api.listImages.mockResolvedValue([{ ...images[0], tags: manyTags }]);
  localStorage.setItem("images-filters-v2", JSON.stringify({ categories: ["Removed category"] }));
  await load();
  expect(screen.getByRole("checkbox", { name: /^Removed category / })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Remove Category: Removed category" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Find tags" }), { target: { value: "tag-8" } });
  const tags = within(screen.getByRole("group", { name: "Tags" }));
  expect(tags.getAllByRole("checkbox")).toHaveLength(1);
  choose("Tags", "tag-8");
  expect(screen.getByRole("status")).toHaveTextContent("1 of 1 image");
});
