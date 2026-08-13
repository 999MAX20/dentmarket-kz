import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectStorageService } from "./object-storage.service";

describe("ObjectStorageService serverless local fallback", () => {
  const originalVercel = process.env.VERCEL;
  const originalDriver = process.env.OBJECT_STORAGE_DRIVER;
  const originalPath = process.env.LOCAL_STORAGE_PATH;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalDriver === undefined) delete process.env.OBJECT_STORAGE_DRIVER;
    else process.env.OBJECT_STORAGE_DRIVER = originalDriver;
    if (originalPath === undefined) delete process.env.LOCAL_STORAGE_PATH;
    else process.env.LOCAL_STORAGE_PATH = originalPath;
  });

  it("uses the writable /tmp volume when a pilot runs on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OBJECT_STORAGE_DRIVER", "local");
    delete process.env.LOCAL_STORAGE_PATH;

    const storage = new ObjectStorageService();
    await expect(storage.health()).resolves.toEqual({
      status: "ok",
      driver: "local",
    });
  });
});
