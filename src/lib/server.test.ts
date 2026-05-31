import { vi, describe, it, expect, beforeEach } from "vitest";
import { jsonError, isUniqueViolation, loadImages } from "./server";
import { db } from "@/db/client";
import { presignedGetUrl } from "@/lib/storage";

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn(),
  },
}));

vi.mock("@/lib/storage", () => ({
  presignedGetUrl: vi.fn(),
}));

describe("server utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("jsonError", () => {
    it("should return a Response object with correct status and headers", async () => {
      const response = jsonError(400, "Bad Request", { field: "name" });
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "Bad Request", details: { field: "name" } });
    });
  });

  describe("isUniqueViolation", () => {
    it("should return true for Postgres 23505 unique constraint errors", () => {
      expect(isUniqueViolation({ code: "23505" })).toBe(true);
    });

    it("should return false for other errors", () => {
      expect(isUniqueViolation({ code: "42703" })).toBe(false);
      expect(isUniqueViolation(null)).toBe(false);
      expect(isUniqueViolation("some error")).toBe(false);
      expect(isUniqueViolation({})).toBe(false);
    });
  });

  describe("loadImages", () => {
    it("should query the database and fetch presigned urls", async () => {
      const mockImages = [
        {
          id: "img-1",
          s3Key: "worlds/1/image.png",
          position: 1,
          mimeType: "image/png",
          width: 800,
          height: 600,
        },
      ];

      // Setup Drizzle chain mock
      const selectMock = vi.mocked(db.select);
      const fromMock = vi.fn().mockReturnThis();
      const whereMock = vi.fn().mockReturnThis();
      const orderByMock = vi.fn().mockResolvedValue(mockImages);

      selectMock.mockReturnValue({
        from: fromMock,
      } as any);

      fromMock.mockReturnValue({
        where: whereMock,
      } as any);

      whereMock.mockReturnValue({
        orderBy: orderByMock,
      } as any);

      const presignedGetUrlMock = vi.mocked(presignedGetUrl);
      presignedGetUrlMock.mockResolvedValue("https://mock-s3.local/img-1.png");

      const result = await loadImages("world_mood", "world-1");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "img-1",
        s3Key: "worlds/1/image.png",
        url: "https://mock-s3.local/img-1.png",
        position: 1,
        mimeType: "image/png",
        width: 800,
        height: 600,
      });

      expect(presignedGetUrlMock).toHaveBeenCalledWith("worlds/1/image.png");
    });
  });
});
