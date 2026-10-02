import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(),
  createAudioUploadUrl: vi.fn(), inspectAudioUpload: vi.fn(),
}));
vi.mock("../config/env", () => ({ env: { audioMaxSizeBytes: 1024 } }));
vi.mock("../lib/prisma", () => ({ prisma: { audioAsset: mocks } }));
vi.mock("../lib/r2-storage", () => ({ ...mocks, R2_UPLOAD_EXPIRES_SECONDS: 300 }));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { sub: "user-1" }; next(); },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
import { announcementAudiosRouter } from "./announcement-audios.route";

describe("R2 announcement upload", () => {
  let server: Server;
  let base: string;
  const audio = { id: "audio-1", createdById: "user-1", status: "uploading",
    storageKey: "announcements/key", mimeType: "audio/mpeg", sizeBytes: 100n };
  beforeAll(async () => {
    const app = express();
    app.use(express.json(), announcementAudiosRouter);
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ message: error.message }));
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUnique.mockResolvedValue(audio);
    mocks.inspectAudioUpload.mockResolvedValue({ object: { ContentLength: 100, ContentType: "audio/mpeg", ETag: "etag" }, url: "https://audio.example.com/announcements/key" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({ ...audio, status: "ready" });
  });
  const complete = () => fetch(`${base}/audios/audio-1/upload-complete`, { method: "POST" });
  it("creates an upload with a backend-generated key and required PUT headers", async () => {
    mocks.createAudioUploadUrl.mockResolvedValue("https://r2.example.com/signed");
    mocks.create.mockResolvedValue({ id: audio.id });
    const response = await fetch(`${base}/audios/upload`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Stop", category: "stop_announcement", fileName: "../stop.mp3", mimeType: "audio/mpeg", sizeBytes: 100 }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ audioId: audio.id, method: "PUT", headers: { "Content-Type": "audio/mpeg", "If-None-Match": "*" } });
    expect(mocks.createAudioUploadUrl).toHaveBeenCalledWith(expect.stringMatching(/^announcements\/[a-f0-9-]+$/), "audio/mpeg", 100);
  });
  it("marks verified audio ready with permanent URLs", async () => {
    expect((await complete()).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ready", blobUrl: "https://audio.example.com/announcements/key" }) }));
  });
  it.each([{ ContentLength: 101, ContentType: "audio/mpeg" }, { ContentLength: 100, ContentType: "text/html" }])("rejects mismatched metadata %j", async (object) => {
    mocks.inspectAudioUpload.mockResolvedValue({ object, url: "https://audio.example.com/key" });
    expect((await complete()).status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("does not allow another uploader to complete the asset", async () => {
    mocks.findUnique.mockResolvedValue({ ...audio, createdById: "other-user" });
    expect((await complete()).status).toBe(404);
    expect(mocks.inspectAudioUpload).not.toHaveBeenCalled();
  });
  it("does not revive an archived asset", async () => {
    mocks.findUnique.mockResolvedValue({ ...audio, status: "archived" });
    expect((await complete()).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("allows completion retries without a second storage request", async () => {
    mocks.findUnique.mockResolvedValue({ ...audio, status: "ready" });
    expect((await complete()).status).toBe(200);
    expect(mocks.inspectAudioUpload).not.toHaveBeenCalled();
  });
  it("does not mark a missing object ready", async () => {
    mocks.inspectAudioUpload.mockRejectedValue(Object.assign(new Error("Audio file has not been uploaded to R2"), { statusCode: 400 }));
    expect((await complete()).status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects completion if the asset was archived during verification", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await complete()).status).toBe(409);
    expect(mocks.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
