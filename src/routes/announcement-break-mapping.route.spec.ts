import express from "express";
import type { Server } from "node:http";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audio: { findUnique: vi.fn(), findMany: vi.fn() },
  settings: { findUnique: vi.fn(), upsert: vi.fn() },
  transaction: vi.fn(), lock: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: { audioAsset: mocks.audio, announcementSettings: mocks.settings, $transaction: mocks.transaction } }));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { sub: "admin" }; next(); },
  requirePermission: ({ module, submodule, action }: any) => (req: any, res: any, next: any) => {
    if (req.headers["x-deny-permission"] === `${module}/${submodule}/${action}`) return res.status(403).json({ message: "Forbidden" });
    next();
  },
}));
import { announcementSettingsRouter } from "./announcement-settings.route";
import { getQuickAnnouncements } from "../lib/mobile-announcements";

describe("Break button audio mapping", () => {
  let server: Server;
  let base: string;
  let settings: { id: string; dinnerBreakAudioId: string | null; toiletBreakAudioId: string | null; recordsDriveUrl: string | null };
  const audio = { id: "a1", title: "Toilet break announcement", category: "common_audio", status: "ready", downloadUrl: "https://audio.example.com/1.mp3", blobUrl: null, mimeType: "audio/mpeg", durationMs: 1000 };
  const map = (target: string, headers = {}) => fetch(`${base}/audios/a1/break-mapping`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ target }) });
  beforeAll(async () => {
    const app = express();
    app.use(express.json(), announcementSettingsRouter);
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ message: error.message }));
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  beforeEach(() => {
    vi.resetAllMocks();
    settings = { id: "default", dinnerBreakAudioId: "old-dinner", toiletBreakAudioId: "old-toilet", recordsDriveUrl: "https://drive.google.com/drive/folders/123" };
    mocks.audio.findUnique.mockResolvedValue(audio);
    mocks.audio.findMany.mockResolvedValue([]);
    mocks.settings.findUnique.mockImplementation(async ({ include }: any) => include ? {
      ...settings,
      dinnerBreakAudio: settings.dinnerBreakAudioId ? { ...audio, id: settings.dinnerBreakAudioId } : null,
      toiletBreakAudio: settings.toiletBreakAudioId ? { ...audio, id: settings.toiletBreakAudioId } : null,
    } : settings);
    mocks.settings.upsert.mockImplementation(async ({ update }: any) => { settings = { ...settings, ...update }; return settings; });
    mocks.transaction.mockImplementation(async (fn: any) => fn({ $queryRaw: mocks.lock, audioAsset: mocks.audio, announcementSettings: mocks.settings }));
  });
  it.each(["dinner_break", "toilet_break"])("maps %s without clearing the other button or Drive URL", async (target) => {
    const response = await map(target);
    expect(response.status).toBe(200);
    const expected = target === "dinner_break" ? { dinnerBreakAudioId: "a1", toiletBreakAudioId: "old-toilet" } : { dinnerBreakAudioId: "old-dinner", toiletBreakAudioId: "a1" };
    expect((await response.json()).data).toMatchObject({ ...expected, recordsDriveUrl: settings.recordsDriveUrl });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.lock.mock.calls[0][0].join("?")).toContain("FOR UPDATE");
  });
  it("moves this audio from Toilet Break to Dinner Break", async () => {
    settings.toiletBreakAudioId = "a1";
    expect((await map("dinner_break")).status).toBe(200);
    expect(settings).toMatchObject({ dinnerBreakAudioId: "a1", toiletBreakAudioId: null });
  });
  it("supports the same audio on both buttons explicitly", async () => {
    expect((await map("both")).status).toBe(200);
    expect(settings).toMatchObject({ dinnerBreakAudioId: "a1", toiletBreakAudioId: "a1" });
  });
  it("unmaps only this audio, preserving another file's mapping", async () => {
    settings.toiletBreakAudioId = "a1";
    expect((await map("none")).status).toBe(200);
    expect(settings).toMatchObject({ dinnerBreakAudioId: "old-dinner", toiletBreakAudioId: null });
  });
  it("creates settings for the first mapped file", async () => {
    mocks.settings.findUnique.mockResolvedValue(null);
    expect((await map("toilet_break")).status).toBe(200);
    expect(mocks.settings.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { id: "default", updatedById: "admin", toiletBreakAudioId: "a1" } }));
  });
  it.each(["uploading", "failed", "archived"])("does not publish %s audio", async (status) => {
    mocks.audio.findUnique.mockResolvedValue({ ...audio, status });
    expect((await map("toilet_break")).status).toBe(409);
    expect(mocks.settings.upsert).not.toHaveBeenCalled();
  });
  it.each(["welcome_note", "stop_announcement"])("rejects the %s category", async (category) => {
    mocks.audio.findUnique.mockResolvedValue({ ...audio, category });
    expect((await map("toilet_break")).status).toBe(400);
    expect(mocks.settings.upsert).not.toHaveBeenCalled();
  });
  it("does not publish an insecure or missing playback URL", async () => {
    for (const downloadUrl of [null, "http://audio.example.com/file.mp3"]) {
      mocks.audio.findUnique.mockResolvedValue({ ...audio, downloadUrl });
      expect((await map("dinner_break")).status).toBe(409);
    }
    expect(mocks.settings.upsert).not.toHaveBeenCalled();
  });
  it("requires Mobile settings permission, not just upload permission", async () => {
    expect((await map("toilet_break", { "x-deny-permission": "announcements/settings/edit" })).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects unknown targets and missing audio", async () => {
    expect((await map("unknown")).status).toBe(400);
    mocks.audio.findUnique.mockResolvedValue(null);
    expect((await map("toilet_break")).status).toBe(404);
    expect(mocks.settings.upsert).not.toHaveBeenCalled();
  });
  it("exposes a new mapping through the existing mobile contract", async () => {
    expect((await map("toilet_break")).status).toBe(200);
    const quick = await getQuickAnnouncements();
    expect(quick.find(item => item.id === "toilet-break")).toMatchObject({ type: "SINGLE", audio: { id: "a1", title: audio.title }, audioUrl: audio.downloadUrl });
    expect(quick.find(item => item.id === "dinner-break")).toMatchObject({ audio: { id: "old-dinner" } });
  });
  it("repeating a mapping is safe", async () => {
    await map("toilet_break");
    await map("toilet_break");
    expect(settings).toMatchObject({ dinnerBreakAudioId: "old-dinner", toiletBreakAudioId: "a1" });
  });
  it("returns a retryable conflict for concurrent settings changes", async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Serialization failure", { code: "P2034", clientVersion: "test" }));
    const response = await map("toilet_break");
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("Refresh and try again");
  });
});
