import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewNamedEntityForm, EditNamedEntityForm } from "./NamedEntityForms";
import { api } from "@/lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock next/navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock the API client
vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

// Mock ImageUploader since it contains S3 upload logic that we don't want to run in unit tests
vi.mock("@/components/ImageUploader", () => ({
  ImageUploader: () => <div data-testid="image-uploader">Mock Image Uploader</div>,
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("NamedEntityForms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("NewNamedEntityForm", () => {
    it("renders Character creation form correctly", () => {
      renderWithProviders(<NewNamedEntityForm kind="character" worldId="world-1" />);
      expect(screen.getByRole("heading", { name: /new character/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Aiko Reiko")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Looks, voice, personality, motivations…")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create character/i })).toBeInTheDocument();
    });

    it("validates form values and displays validation errors", async () => {
      renderWithProviders(<NewNamedEntityForm kind="character" worldId="world-1" />);
      const submitBtn = screen.getByRole("button", { name: /create character/i });
      
      await userEvent.click(submitBtn);

      expect(await screen.findByText("Name is required")).toBeInTheDocument();
      expect(screen.getByText("Description is required")).toBeInTheDocument();
    });

    it("calls API on successful submit and redirects", async () => {
      const mockCreated = { id: "char-1", name: "Aiko Reiko", description: "Brave character" };
      vi.mocked(api.post).mockResolvedValue(mockCreated);

      renderWithProviders(<NewNamedEntityForm kind="character" worldId="world-1" />);

      await userEvent.type(screen.getByPlaceholderText("Aiko Reiko"), "Aiko Reiko");
      await userEvent.type(screen.getByPlaceholderText("Looks, voice, personality, motivations…"), "Brave character");
      await userEvent.click(screen.getByRole("button", { name: /create character/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith("/api/worlds/world-1/characters", {
          name: "Aiko Reiko",
          description: "Brave character",
        });
        expect(mockPush).toHaveBeenCalledWith("/worlds/world-1/characters/char-1");
      });
    });
  });

  describe("EditNamedEntityForm", () => {
    const mockCharacter = {
      id: "char-1",
      worldId: "world-1",
      name: "Aiko Reiko",
      description: "Existing brave character",
      images: [],
    };

    it("renders loading initially", () => {
      vi.mocked(api.get).mockReturnValue(new Promise(() => {})); // never resolves
      renderWithProviders(<EditNamedEntityForm kind="character" worldId="world-1" entityId="char-1" />);
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("renders form prefilled with existing character details", async () => {
      vi.mocked(api.get).mockResolvedValue(mockCharacter);
      renderWithProviders(<EditNamedEntityForm kind="character" worldId="world-1" entityId="char-1" />);

      expect(await screen.findByRole("heading", { name: "Aiko Reiko" })).toBeInTheDocument();
      const descInput = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(descInput.value).toBe("Existing brave character");
      expect(screen.getByTestId("image-uploader")).toBeInTheDocument();
    });

    it("submits patch update correctly", async () => {
      vi.mocked(api.get).mockResolvedValue(mockCharacter);
      vi.mocked(api.patch).mockResolvedValue({});

      renderWithProviders(<EditNamedEntityForm kind="character" worldId="world-1" entityId="char-1" />);

      const descInput = await screen.findByRole("textbox");
      await userEvent.clear(descInput);
      await userEvent.type(descInput, "Updated description");
      await userEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith("/api/worlds/world-1/characters/char-1", {
          description: "Updated description",
        });
      });
    });

    it("deletes entity and redirects back to world on delete click", async () => {
      vi.mocked(api.get).mockResolvedValue(mockCharacter);
      vi.mocked(api.del).mockResolvedValue({});
      
      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderWithProviders(<EditNamedEntityForm kind="character" worldId="world-1" entityId="char-1" />);

      // Wait for the character to load
      await screen.findByRole("heading", { name: "Aiko Reiko" });

      const dangerButtons = screen.getAllByRole("button");
      const deleteButton = dangerButtons.find(b => b.className.includes("bg-[var(--color-danger)]"));
      expect(deleteButton).toBeDefined();

      await userEvent.click(deleteButton!);

      expect(confirmSpy).toHaveBeenCalledWith("Delete this character?");
      await waitFor(() => {
        expect(api.del).toHaveBeenCalledWith("/api/worlds/world-1/characters/char-1");
        expect(mockPush).toHaveBeenCalledWith("/worlds/world-1");
      });
    });
  });
});
