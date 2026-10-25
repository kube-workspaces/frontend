import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ImageRepositoryDetailPage from "@/app/admin/imagerepositories/[name]/page";
import NewImageRepositoryPage from "@/app/admin/imagerepositories/new/page";

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), create: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ name: "image-catalog" }), useRouter: () => ({ push: api.push }) }));
vi.mock("@/lib/api", () => ({
  getImageRepository: api.get, updateImageRepository: api.update, createImageRepository: api.create,
  deleteImageRepository: vi.fn(), syncImageRepository: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("alert", vi.fn());
  api.get.mockResolvedValue({
    metadata: { name: "image-catalog", resourceVersion: "123" },
    spec: { url: "https://example.com/catalog.git", ref: "main", paths: ["images/", "old-folder"] },
  });
});

it("edits separate paths with add/remove controls and saves a normalized array", async () => {
  render(<ImageRepositoryDetailPage />);
  expect(await screen.findByRole("textbox", { name: "Repository path 1" })).toHaveValue("images/");
  fireEvent.click(screen.getByRole("button", { name: "Remove path 2" }));
  fireEvent.click(screen.getByRole("button", { name: /Add path/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Repository path 2" }), { target: { value: " images/kasm/core/ " } });
  fireEvent.click(screen.getByRole("button", { name: /Add path/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Repository path 3" }), { target: { value: "images/kasm/desktop" } });
  expect(api.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api.update).toHaveBeenCalledWith("image-catalog", expect.objectContaining({
    metadata: { name: "image-catalog", resourceVersion: "123" },
    spec: expect.objectContaining({ paths: ["images", "images/kasm/core", "images/kasm/desktop"] }),
  })));
});

it("uses the default images folder when all path rows are removed on creation", async () => {
  render(<NewImageRepositoryPage />);
  fireEvent.click(screen.getByRole("button", { name: "Remove path 1" }));
  expect(screen.queryByRole("textbox", { name: /Repository path/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Defaults to images/)).toBeInTheDocument();
  fireEvent.submit(screen.getByRole("button", { name: "Create" }).closest("form")!);
  await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
    spec: expect.objectContaining({ paths: ["images"] }),
  })));
});
