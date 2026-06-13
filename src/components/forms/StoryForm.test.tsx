import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoryForm } from "./StoryForm";
import { api } from "@/lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const char1Uuid = "11111111-1111-1111-1111-111111111111";
const char2Uuid = "22222222-2222-2222-2222-222222222222";
const loc1Uuid = "33333333-3333-3333-3333-333333333333";
const storyUuid = "44444444-4444-4444-4444-444444444444";

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
  STORY_LENGTHS: [30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180],
}));

// Mock sub-components
vi.mock("@/components/ImageUploader", () => ({
  ImageUploader: () => <div data-testid="image-uploader">Mock Image Uploader</div>,
}));
vi.mock("@/components/StorySongsPanel", () => ({
  StorySongsPanel: () => <div data-testid="songs-panel">Mock Songs Panel</div>,
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

describe("StoryForm", () => {
  const mockCharacters = [
    { id: char1Uuid, name: "Aiko" },
    { id: char2Uuid, name: "Kenji" },
  ];
  const mockLocations = [
    { id: loc1Uuid, name: "Neo Tokyo" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes("characters")) return Promise.resolve(mockCharacters);
      if (url.includes("locations")) return Promise.resolve(mockLocations);
      return Promise.resolve([]);
    });
  });

  describe("Create Mode", () => {
    it("renders create form fields correctly", async () => {
      renderWithProviders(<StoryForm kind="create" worldId="world-1" />);

      expect(screen.getByText(/new story/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Song title")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("What happens? Beats, twists, mood…")).toBeInTheDocument();

      // Characters should load and render
      await waitFor(() => {
        expect(screen.getByText("Aiko")).toBeInTheDocument();
        expect(screen.getByText("Kenji")).toBeInTheDocument();
        expect(screen.getByText("Neo Tokyo")).toBeInTheDocument();
      });
    });

    it("displays validation error when submitting empty form", async () => {
      renderWithProviders(<StoryForm kind="create" worldId="world-1" />);

      const submitBtn = screen.getByRole("button", { name: /create story/i });
      await userEvent.click(submitBtn);

      expect(await screen.findByText("Name is required")).toBeInTheDocument();
      expect(screen.getByText("Description is required")).toBeInTheDocument();
      expect(screen.getByText("Pick at least one character")).toBeInTheDocument();
    });

    it("submits the story successfully on valid input", async () => {
      const mockCreated = { id: storyUuid, name: "My Story", description: "Desc" };
      vi.mocked(api.post).mockResolvedValue(mockCreated);

      renderWithProviders(<StoryForm kind="create" worldId="world-1" />);

      await userEvent.type(screen.getByPlaceholderText("Song title"), "My Story");
      await userEvent.type(screen.getByPlaceholderText("What happens? Beats, twists, mood…"), "Once upon a time...");
      
      // Wait for characters to load and toggle Aiko
      await waitFor(() => screen.getByText("Aiko"));
      await userEvent.click(screen.getByText("Aiko"));

      await userEvent.click(screen.getByRole("button", { name: /create story/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith("/api/worlds/world-1/stories", {
          name: "My Story",
          description: "Once upon a time...",
          characterIds: [char1Uuid],
          locationIds: [],
          lengthSeconds: 60,
          lyrics: "",
        });
        expect(mockPush).toHaveBeenCalledWith(`/worlds/world-1/stories/${storyUuid}`);
      });
    });
  });

  describe("Edit Mode", () => {
    const mockStory = {
      id: storyUuid,
      worldId: "world-1",
      name: "Neo Quest",
      description: "A cyberpunk quest",
      characterIds: [char1Uuid],
      locationIds: [],
      lengthSeconds: 90,
      lyrics: "Cyber dreams...",
      selectedSongId: null,
      moodImages: [],
    };

    beforeEach(() => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.includes("characters")) return Promise.resolve(mockCharacters);
        if (url.includes("locations")) return Promise.resolve(mockLocations);
        if (url.includes("songs")) return Promise.resolve([]);
        if (url.includes("lyrics/versions")) return Promise.resolve([]);
        if (url.includes(`stories/${storyUuid}`)) return Promise.resolve(mockStory);
        return Promise.resolve([]);
      });
    });

    it("prefills the form with existing story data", async () => {
      renderWithProviders(<StoryForm kind="edit" worldId="world-1" storyId={storyUuid} />);

      // Wait for load
      await waitFor(() => {
        const titleInput = screen.getByPlaceholderText("Song title") as HTMLInputElement;
        expect(titleInput.value.toLowerCase()).toBe("neo quest");
      });

      const descInput = screen.getByPlaceholderText("What happens? Beats, twists, mood…") as HTMLTextAreaElement;
      expect(descInput.value).toBe("A cyberpunk quest");

      const lyricsInput = screen.getByPlaceholderText("Write or generate lyrics for this story...") as HTMLTextAreaElement;
      expect(lyricsInput.value).toBe("Cyber dreams...");

      // MultiSelect character Aiko should be active
      expect(screen.getByText("Aiko")).toBeInTheDocument();

      // Sidebars/Subpanels should render
      expect(screen.getByTestId("image-uploader")).toBeInTheDocument();
      expect(screen.getByTestId("songs-panel")).toBeInTheDocument();
    });

    it("performs autosave after debounce delay when fields are changed", async () => {
      vi.mocked(api.patch).mockResolvedValue({ id: storyUuid });
      renderWithProviders(<StoryForm kind="edit" worldId="world-1" storyId={storyUuid} />);

      // Wait for inputs to populate
      await waitFor(() => {
        expect((screen.getByPlaceholderText("Song title") as HTMLInputElement).value.toLowerCase()).toBe("neo quest");
      });

      // Change description
      const descInput = screen.getByPlaceholderText("What happens? Beats, twists, mood…");
      await userEvent.type(descInput, " Updated.");

      // Check that patch hasn't been called immediately
      expect(api.patch).not.toHaveBeenCalled();

      // Wait 800ms (debounce is 650ms)
      await new Promise((resolve) => setTimeout(resolve, 800));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(`/api/worlds/world-1/stories/${storyUuid}`, {
          name: "Neo Quest",
          description: "A cyberpunk quest Updated.",
          characterIds: [char1Uuid],
          locationIds: [],
          lengthSeconds: 90,
          lyrics: "Cyber dreams...",
        });
      });

      expect(await screen.findByText("Saved.")).toBeInTheDocument();
    });

    it("displays LyricsHistoryPanel when versions exist", async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.includes("characters")) return Promise.resolve(mockCharacters);
        if (url.includes("locations")) return Promise.resolve(mockLocations);
        if (url.includes("songs")) return Promise.resolve([]);
        if (url.includes("lyrics/versions"))
          return Promise.resolve([
            {
              id: "v1",
              storyId: storyUuid,
              lyrics: "Old lyrics version",
              prompt: "Initial draft",
              createdAt: new Date().toISOString(),
            },
          ]);
        if (url.includes(`stories/${storyUuid}`)) return Promise.resolve(mockStory);
        return Promise.resolve([]);
      });

      renderWithProviders(<StoryForm kind="edit" worldId="world-1" storyId={storyUuid} />);

      await waitFor(() => {
        expect(screen.getByText(/version history/i)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText(/version history/i));

      await waitFor(() => {
        expect(screen.getByText("Initial draft")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
      });
    });

    it("shows generate lyrics button when lyrics are empty and triggers generation", async () => {
      const mockStoryNoLyrics = { ...mockStory, lyrics: "" };
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.includes("characters")) return Promise.resolve(mockCharacters);
        if (url.includes("locations")) return Promise.resolve(mockLocations);
        if (url.includes("songs")) return Promise.resolve([]);
        if (url.includes("lyrics/versions")) return Promise.resolve([]);
        if (url.includes(`stories/${storyUuid}`)) return Promise.resolve(mockStoryNoLyrics);
        return Promise.resolve([]);
      });

      renderWithProviders(<StoryForm kind="edit" worldId="world-1" storyId={storyUuid} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /generate lyrics/i })).toBeInTheDocument();
      });
    });

    it("shows refine input when lyrics exist and triggers refinement", async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.includes("characters")) return Promise.resolve(mockCharacters);
        if (url.includes("locations")) return Promise.resolve(mockLocations);
        if (url.includes("songs")) return Promise.resolve([]);
        if (url.includes("lyrics/versions")) return Promise.resolve([]);
        if (url.includes(`stories/${storyUuid}`)) return Promise.resolve(mockStory);
        return Promise.resolve([]);
      });

      renderWithProviders(<StoryForm kind="edit" worldId="world-1" storyId={storyUuid} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/tell ai what to change/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /refine/i })).toBeInTheDocument();
      });
    });

    it("deletes story and redirects on trash click", async () => {
      vi.mocked(api.del).mockResolvedValue({});

      renderWithProviders(<StoryForm kind="edit" worldId="world-1" storyId={storyUuid} />);

      // Wait for loading to finish
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "" })).toBeInTheDocument(); // Trash button
      });

      const trashBtn = screen.getByRole("button", { name: "" });
      await userEvent.click(trashBtn);

      // Click the ConfirmDialog confirm button
      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      await userEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.del).toHaveBeenCalledWith(`/api/worlds/world-1/stories/${storyUuid}`);
        expect(mockPush).toHaveBeenCalledWith("/worlds/world-1");
      });
    });
  });
});
