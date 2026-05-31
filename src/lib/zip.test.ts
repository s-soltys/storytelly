import { describe, it, expect } from "vitest";
import { createZip, type ZipEntry } from "./zip";

describe("ZIP creation utility", () => {
  it("should create a zip file buffer from entry strings and buffers", () => {
    const entries: ZipEntry[] = [
      { path: "test.txt", data: "hello world" },
      { path: "folder/data.bin", data: Buffer.from([1, 2, 3, 4]) },
    ];

    const result = createZip(entries);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    // Verify zip signature (PK\x03\x04 is 0x04034b50 in little endian, which is 50 4b 03 04)
    expect(result[0]).toBe(0x50);
    expect(result[1]).toBe(0x4b);
    expect(result[2]).toBe(0x03);
    expect(result[3]).toBe(0x04);
  });

  it("should strip leading slashes from paths", () => {
    const entries1 = [{ path: "/test.txt", data: "content" }];
    const entries2 = [{ path: "test.txt", data: "content" }];

    const zip1 = createZip(entries1);
    const zip2 = createZip(entries2);

    expect(zip1.length).toBe(zip2.length);
  });
});
