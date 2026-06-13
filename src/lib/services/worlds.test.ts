import { vi, describe, it, expect, beforeEach } from "vitest";
import { getWorlds, getWorldById, createWorld, updateWorld, deleteWorld } from "./worlds";
import { db } from "@/db/client";
import * as server from "@/lib/server";

vi.mock("@/db/client", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/server", () => ({
  loadImages: vi.fn(),
}));

describe("worlds service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWorlds", () => {
    it("returns worlds with mood images", async () => {
      const mockWorlds = [{ id: "w1", name: "Test", artStyle: "Fantasy", description: "A world", createdAt: new Date(), updatedAt: new Date() }];
      const mockImages = [{ id: "i1", url: "https://cdn.com/img.jpg", s3Key: "key", position: 0, mimeType: "image/png", width: 800, height: 600, ownerId: "w1" }];

      const orderByMock = vi.fn().mockResolvedValue(mockWorlds);
      const fromMock = vi.fn().mockReturnValue({ orderBy: orderByMock } as any);

      vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);
      vi.mocked(server.loadImages).mockResolvedValue(mockImages);

      const result = await getWorlds();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test");
      expect(result[0].moodImages).toEqual(mockImages);
    });
  });

  describe("getWorldById", () => {
    it("returns null when world not found", async () => {
      const whereMock = vi.fn().mockResolvedValue([]);
      vi.mocked(db.select).mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock } as any) } as any);

      const result = await getWorldById("nonexistent");
      expect(result).toBeNull();
    });

    it("returns world with mood images when found", async () => {
      const mockWorld = { id: "w1", name: "Test", artStyle: "Fantasy", description: "Desc", createdAt: new Date(), updatedAt: new Date() };
      const mockImages = [{ id: "i1", url: "https://cdn.com/img.jpg", s3Key: "key", position: 0, mimeType: "image/png", width: 800, height: 600, ownerId: "w1" }];

      const whereMock = vi.fn().mockResolvedValue([mockWorld]);
      vi.mocked(db.select).mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMock } as any) } as any);
      vi.mocked(server.loadImages).mockResolvedValue(mockImages);

      const result = await getWorldById("w1");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test");
      expect(result!.moodImages).toEqual(mockImages);
    });
  });

  describe("createWorld", () => {
    it("inserts and returns the created world", async () => {
      const mockCreated = { id: "w1", name: "New", artStyle: "Sci-fi", description: "Desc", createdAt: new Date(), updatedAt: new Date() };
      const returningMock = vi.fn().mockResolvedValue([mockCreated]);
      vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock } as any) } as any);

      const result = await createWorld({ name: "New", artStyle: "Sci-fi", description: "Desc" });
      expect(result.id).toBe("w1");
    });
  });

  describe("updateWorld", () => {
    it("updates and returns the world", async () => {
      const mockUpdated = { id: "w1", name: "Updated", artStyle: "Fantasy", description: "Desc", createdAt: new Date(), updatedAt: new Date() };
      const returningMock = vi.fn().mockResolvedValue([mockUpdated]);
      vi.mocked(db.update).mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: returningMock } as any) } as any) } as any);

      const result = await updateWorld("w1", { name: "Updated" });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Updated");
    });

    it("returns null when world not found", async () => {
      const returningMock = vi.fn().mockResolvedValue([]);
      vi.mocked(db.update).mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: returningMock } as any) } as any) } as any);

      const result = await updateWorld("nonexistent", { name: "Updated" });
      expect(result).toBeNull();
    });
  });

  describe("deleteWorld", () => {
    it("returns true when deletion succeeds", async () => {
      const returningMock = vi.fn().mockResolvedValue([{ id: "w1" }]);
      vi.mocked(db.delete).mockReturnValue({ where: vi.fn().mockReturnValue({ returning: returningMock } as any) } as any);

      const result = await deleteWorld("w1");
      expect(result).toBe(true);
    });

    it("returns false when world not found", async () => {
      const returningMock = vi.fn().mockResolvedValue([]);
      vi.mocked(db.delete).mockReturnValue({ where: vi.fn().mockReturnValue({ returning: returningMock } as any) } as any);

      const result = await deleteWorld("nonexistent");
      expect(result).toBe(false);
    });
  });
});
