import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(),
  delete: vi.fn(), deleteObject: vi.fn(),
}));
vi.mock("../config/env", () => ({ env: { audioMaxSizeBytes: 52428800 } }));
vi.mock("../middleware/auth", () => ({ requireAuth: vi.fn(), requirePermission: () => vi.fn() }));
vi.mock("../lib/r2-storage", () => ({
  createAudioUploadUrl: vi.fn(), inspectAudioUpload: vi.fn(),
  deleteAudioObject: mocks.deleteObject, R2_UPLOAD_EXPIRES_SECONDS: 300,
}));
vi.mock("../lib/prisma", () => ({
  prisma: { $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({ audioAsset: mocks }) },
}));

import { announcementAudiosRouter } from "./announcement-audios.route";

function remove() {
  const route = announcementAudiosRouter.stack.find((layer) => layer.route?.path === "/audios/:audioId/permanent")!.route!;
  return new Promise((resolve, reject) => {
    const res = { status: () => res, json: resolve };
    route.stack.at(-1)!.handle({ params: { audioId: "audio-1" } } as unknown as Request, res as unknown as Response, reject);
  });
}

describe("permanent audio deletion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "audio-1", storageKey: "announcements/audio-1", archivedFromStatus: "ready",
      createdAt: new Date(0),
      _count: { routeAssignments: 0, activeInSettings: 0, dinnerInSettings: 0, toiletInSettings: 0 },
    });
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue({ id: "audio-1" });
  });

  it("removes the stored object before its database record", async () => {
    await expect(remove()).resolves.toEqual({ success: true, data: { id: "audio-1" } });
    expect(mocks.deleteObject).toHaveBeenCalledWith("announcements/audio-1");
    expect(mocks.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(mocks.delete.mock.invocationCallOrder[0]);
  });

  it("rejects audio that is not archived", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ id: "audio-1" });
    await expect(remove()).rejects.toThrow("Only recently deleted audio");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("rejects missing audio", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue(null);
    await expect(remove()).rejects.toThrow("Audio asset not found");
  });

  it("rejects audio still referenced by settings or routes", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({ _count: { dinnerInSettings: 1 } });
    await expect(remove()).rejects.toThrow("Audio is in use");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("keeps the database record if storage deletion fails", async () => {
    mocks.deleteObject.mockRejectedValue(new Error("Storage unavailable"));
    await expect(remove()).rejects.toThrow("Storage unavailable");
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("waits for an unfinished upload link to expire", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      archivedFromStatus: "uploading", createdAt: new Date(), _count: { routeAssignments: 0 },
    });
    await expect(remove()).rejects.toThrow("upload link is still active");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
