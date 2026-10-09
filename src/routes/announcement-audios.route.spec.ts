import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(),
  findMany: vi.fn(), count: vi.fn(),
  createAudioUploadUrl: vi.fn(), inspectAudioUpload: vi.fn(),
}));
vi.mock("../config/env", () => ({ env: { audioMaxSizeBytes: 1024 } }));
vi.mock("../lib/prisma", () => ({ prisma: { audioAsset: mocks, $transaction: (queries: Promise<unknown>[]) => Promise.all(queries) } }));
vi.mock("../lib/r2-storage", () => ({ ...mocks, R2_UPLOAD_EXPIRES_SECONDS: 300 }));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { sub: "user-1" }; next(); },
  requirePermission: ({ action }: { action: string }) => (req: any, res: any, next: any) => {
    if (req.headers["x-deny-permission"] === action) return res.status(403).json({ message: "Forbidden" });
    next();
  },
}));
import { announcementAudiosRouter } from "./announcement-audios.route";

describe("Announcement audio lifecycle", () => {
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

  const unused = { ...audio, status: "ready", _count: { routeAssignments: 0, activeInSettings: 0, dinnerInSettings: 0, toiletInSettings: 0 } };
  const remove = () => fetch(`${base}/audios/audio-1`, { method: "DELETE" });
  const restore = () => fetch(`${base}/audios/audio-1/restore`, { method: "POST" });

  it("excludes deleted audio from the default library", async () => {
    mocks.findMany.mockResolvedValue([{ ...audio, status: "ready" }]);
    mocks.count.mockResolvedValue(1);
    const response = await fetch(`${base}/audios`);
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { not: "archived" } } }));
    expect((await response.json()).data.pagination.total).toBe(1);
  });
  it("lists recently deleted audio with search, category and pagination", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(101);
    const response = await fetch(`${base}/audios?status=archived&search=Stop&category=stop_announcement&page=2&pageSize=100`);
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "archived", category: "stop_announcement", OR: expect.arrayContaining([{ description: { contains: "Stop", mode: "insensitive" } }]) },
      orderBy: { updatedAt: "desc" }, skip: 100, take: 100,
    }));
    expect((await response.json()).data.pagination).toMatchObject({ page: 2, total: 101, totalPages: 2 });
  });
  it.each(["ready", "uploading", "failed"])("soft-deletes %s audio and retains its status", async (status) => {
    mocks.findUnique.mockResolvedValue({ ...unused, status });
    expect((await remove()).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: audio.id, status, routeAssignments: { none: {} }, activeInSettings: { none: {} }, dinnerInSettings: { none: {} }, toiletInSettings: { none: {} } },
      data: { status: "archived", archivedFromStatus: status },
    });
  });
  it.each(["routeAssignments", "activeInSettings", "dinnerInSettings", "toiletInSettings"])("protects audio used by %s", async (relation) => {
    mocks.findUnique.mockResolvedValue({ ...unused, _count: { ...unused._count, [relation]: 1 } });
    expect((await remove()).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("does not overwrite the retained status on repeated delete", async () => {
    mocks.findUnique.mockResolvedValue({ ...unused, status: "archived", archivedFromStatus: "ready" });
    expect((await remove()).status).toBe(200);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects delete when audio changed or acquired references", async () => {
    mocks.findUnique.mockResolvedValue(unused);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await remove()).status).toBe(409);
  });
  it.each(["ready", "uploading", "failed"])("restores deleted audio to its previous %s status", async (status) => {
    mocks.findUnique.mockResolvedValue({ ...audio, status: "archived", archivedFromStatus: status });
    mocks.findUniqueOrThrow.mockResolvedValue({ ...audio, status });
    const response = await restore();
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe(status);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: audio.id, status: "archived" }, data: { status, archivedFromStatus: null } });
    expect(mocks.inspectAudioUpload).not.toHaveBeenCalled();
  });
  it.each([null, "archived"])("rejects restore with an invalid previous status %s", async (archivedFromStatus) => {
    mocks.findUnique.mockResolvedValue({ ...audio, status: "archived", archivedFromStatus });
    expect((await restore()).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects restore of active audio", async () => {
    expect((await restore()).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects concurrent restores without overwriting another change", async () => {
    mocks.findUnique.mockResolvedValue({ ...audio, status: "archived", archivedFromStatus: "ready" });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await restore()).status).toBe(409);
    expect(mocks.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it("requires delete permission for both delete and restore", async () => {
    for (const [path, method] of [["", "DELETE"], ["/restore", "POST"]]) {
      const response = await fetch(`${base}/audios/audio-1${path}`, { method, headers: { "x-deny-permission": "delete" } });
      expect(response.status).toBe(403);
    }
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("returns not found for missing delete and restore targets", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect((await remove()).status).toBe(404);
    expect((await restore()).status).toBe(404);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("prevents editing deleted audio", async () => {
    mocks.findUnique.mockResolvedValue({ ...unused, status: "archived" });
    const response = await fetch(`${base}/audios/audio-1`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Updated" }) });
    expect(response.status).toBe(409);
  });
});
