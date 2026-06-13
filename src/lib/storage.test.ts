import { vi, describe, it, expect, beforeEach } from "vitest";

const mockSend = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = mockSend;
  }
  return {
    S3Client: MockS3Client as unknown as typeof import("@aws-sdk/client-s3").S3Client,
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(() => Promise.resolve("https://presigned.example.com/key")),
}));

// Set env vars before importing the module under test
process.env.S3_BUCKET = "test-bucket";
process.env.S3_ACCESS_KEY = "test-key";
process.env.S3_SECRET_KEY = "test-secret";
process.env.S3_ENDPOINT = "http://localhost:9000";
process.env.S3_FORCE_PATH_STYLE = "true";

const { putObject, presignedGetUrl, presignedPutUrl, deleteObject, getObjectBuffer } = await import("./storage");

describe("storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("putObject", () => {
    it("sends a PutObjectCommand with the given params", async () => {
      mockSend.mockResolvedValueOnce({});
      await putObject("test/key.png", Buffer.from("hello"), "image/png");
      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe("presignedGetUrl", () => {
    it("returns a presigned URL", async () => {
      const url = await presignedGetUrl("test/key.png");
      expect(url).toBe("https://presigned.example.com/key");
    });
  });

  describe("presignedPutUrl", () => {
    it("returns a presigned PUT URL", async () => {
      const url = await presignedPutUrl("test/key.png", "image/png");
      expect(url).toBe("https://presigned.example.com/key");
    });
  });

  describe("deleteObject", () => {
    it("sends a DeleteObjectCommand", async () => {
      mockSend.mockResolvedValueOnce({});
      await deleteObject("test/key.png");
      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe("getObjectBuffer", () => {
    it("returns a buffer from the S3 object", async () => {
      mockSend.mockResolvedValueOnce({
        Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
      });
      const result = await getObjectBuffer("test/key.png");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toHaveLength(3);
    });

    it("throws when S3 object has no body", async () => {
      mockSend.mockResolvedValueOnce({ Body: null });
      await expect(getObjectBuffer("test/key.png")).rejects.toThrow("S3 object has no body");
    });
  });
});
