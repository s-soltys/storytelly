import { vi, describe, it, expect, beforeEach } from "vitest";
import { imageToDataUrl, guessMime } from "./images";
import { getObjectBuffer } from "@/lib/storage";

vi.mock("@/lib/storage", () => ({
  getObjectBuffer: vi.fn(),
}));

const mockSharpBuffer = Buffer.from("mock-resized-buffer");

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(mockSharpBuffer),
  }));
  return { default: mockSharp };
});

describe("AI Images helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts a small image buffer into a base64 data url correctly", async () => {
    const smallBuffer = Buffer.from("small-image-content");
    vi.mocked(getObjectBuffer).mockResolvedValue(smallBuffer);

    const result = await imageToDataUrl({ s3Key: "test.png", mimeType: "image/png" });

    expect(getObjectBuffer).toHaveBeenCalledWith("test.png");
    expect(result).toBe(`data:image/png;base64,${smallBuffer.toString("base64")}`);
  });

  it("guesses MIME type if not provided in arguments", async () => {
    const smallBuffer = Buffer.from("content");
    vi.mocked(getObjectBuffer).mockResolvedValue(smallBuffer);

    const result = await imageToDataUrl({ s3Key: "test.webp", mimeType: null });
    expect(result).toBe(`data:image/webp;base64,${smallBuffer.toString("base64")}`);
    
    const unknownResult = await imageToDataUrl({ s3Key: "test.dat", mimeType: null });
    expect(unknownResult).toBe(`data:application/octet-stream;base64,${smallBuffer.toString("base64")}`);
  });

  it("triggers image resizing if size exceeds TARGET_DATA_URL_IMAGE_BYTES", async () => {
    // Target size threshold is 1_200_000 bytes
    const largeBuffer = Buffer.alloc(1_300_000, "x");
    vi.mocked(getObjectBuffer).mockResolvedValue(largeBuffer);

    const result = await imageToDataUrl({ s3Key: "test.jpg", mimeType: "image/jpeg" });

    // Should return base64 of the mocked sharp buffer
    expect(result).toBe(`data:image/jpeg;base64,${mockSharpBuffer.toString("base64")}`);
  });

  describe("guessMime", () => {
    it("returns image/jpeg for jpg extension", () => {
      expect(guessMime("photo.jpg")).toBe("image/jpeg");
      expect(guessMime("photo.jpeg")).toBe("image/jpeg");
    });

    it("returns image/png for png extension", () => {
      expect(guessMime("photo.png")).toBe("image/png");
    });

    it("returns image/webp for webp extension", () => {
      expect(guessMime("photo.webp")).toBe("image/webp");
    });

    it("returns image/gif for gif extension", () => {
      expect(guessMime("photo.gif")).toBe("image/gif");
    });

    it("returns application/octet-stream for unknown extension", () => {
      expect(guessMime("photo.dat")).toBe("application/octet-stream");
    });

    it("handles uppercase extensions", () => {
      expect(guessMime("photo.JPG")).toBe("image/jpeg");
      expect(guessMime("photo.PNG")).toBe("image/png");
    });

    it("handles key with no extension", () => {
      expect(guessMime("photo")).toBe("application/octet-stream");
    });
  });

  it("returns null if resized image still exceeds MAX_DATA_URL_IMAGE_BYTES", async () => {
    // Over target and max size thresholds
    const oversizedBuffer = Buffer.alloc(4_500_000, "x");
    vi.mocked(getObjectBuffer).mockResolvedValue(oversizedBuffer);

    // Mock sharp to return a buffer that is also too large
    const sharpMock = await import("sharp");
    const oversizedResized = Buffer.alloc(4_100_000, "y");
    vi.mocked(sharpMock.default).mockReturnValue({
      rotate: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(oversizedResized),
    } as any);

    const result = await imageToDataUrl({ s3Key: "test.jpg", mimeType: "image/jpeg" });
    expect(result).toBeNull();
  });
});
