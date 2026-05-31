import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "./api";

describe("API client wrapper", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("performs GET requests and returns parsed JSON", async () => {
    const mockData = { id: 1, name: "Test World" };
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => mockData,
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await api.get("/api/worlds");
    expect(fetch).toHaveBeenCalledWith("/api/worlds", { cache: "no-store" });
    expect(result).toEqual(mockData);
  });

  it("handles 204 No Content by returning undefined", async () => {
    const mockResponse = {
      ok: true,
      status: 204,
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await api.del("/api/worlds/1");
    expect(fetch).toHaveBeenCalledWith("/api/worlds/1", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("performs POST requests with JSON payload", async () => {
    const payload = { name: "New World" };
    const mockResponse = {
      ok: true,
      status: 201,
      json: async () => ({ id: "world-1", ...payload }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await api.post("/api/worlds", payload);
    expect(fetch).toHaveBeenCalledWith("/api/worlds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(result).toEqual({ id: "world-1", ...payload });
  });

  it("throws error with status and details when response is not ok", async () => {
    const errPayload = { error: "Validation failed", details: ["name required"] };
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => errPayload,
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await expect(api.post("/api/worlds", {})).rejects.toThrowError("Validation failed");

    try {
      await api.post("/api/worlds", {});
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(e.details).toEqual(["name required"]);
    }
  });

  it("performs upload requests using FormData", async () => {
    const form = new FormData();
    form.append("file", new Blob(["content"]), "test.png");

    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await api.upload("/api/worlds/1/images", form);
    expect(fetch).toHaveBeenCalledWith("/api/worlds/1/images", {
      method: "POST",
      body: form,
    });
    expect(result).toEqual({ success: true });
  });
});
