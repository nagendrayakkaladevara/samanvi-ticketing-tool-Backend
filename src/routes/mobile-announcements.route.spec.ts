import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routes: { findMany: vi.fn(), findFirst: vi.fn() },
  audios: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  settings: { findUnique: vi.fn(), upsert: vi.fn() },
  pins: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: { announcementRoute: mocks.routes, audioAsset: mocks.audios, announcementSettings: mocks.settings, mobilePinnedRoute: mocks.pins, $transaction: mocks.transaction } }));
vi.mock("../middleware/mobile-auth", () => ({ requireMobileDriverAuth: ((req, res, next) => {
  if (!req.headers.authorization) { res.status(401).json({ message: "Sign in required" }); return; }
  req.mobileDriver = { sub: req.headers.authorization.slice(7) } as Express.Request["mobileDriver"];
  next();
}) satisfies RequestHandler }));
vi.mock("../middleware/auth", () => ({ requireAuth: ((req, _res, next) => { req.user = { sub: "admin" } as Express.Request["user"]; next(); }) satisfies RequestHandler, requirePermission: () => ((_req, _res, next) => next()) satisfies RequestHandler }));
import { mobileAnnouncementsRouter, mobilePinnedRoutesRouter } from "./mobile-announcements.route";
import { announcementSettingsRouter } from "./announcement-settings.route";
import { setRoutePinned } from "../lib/mobile-announcements";

describe("online mobile announcements", () => {
  let server: Server;
  let base: string;
  const route = { id: "r1", routeCode: "ST-A02", origin: "Hyderabad", destination: "Amalapuram", via: "Vijayawada", busType: "AC", pinnedBy: [{ userId: "driver-a" }] };
  const audio = { id: "a1", title: "Departure", mimeType: "audio/mpeg", durationMs: 1000, status: "ready", category: "welcome_note", downloadUrl: "https://audio.example.com/1.mp3", blobUrl: null, sizeBytes: 100n, etag: "immutable-1", storageKey: "one", checksumSha256: null };
  const request = (path: string, method = "GET", body?: unknown, user = "driver-a") => fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${user}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/mobile", mobileAnnouncementsRouter);
    app.use("/pins", mobilePinnedRoutesRouter);
    app.use("/admin", announcementSettingsRouter);
    app.use(((error, _req, res, _next) => res.status(error.statusCode ?? 500).json({ code: error.code, message: error.message })) satisfies ErrorRequestHandler);
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.routes.findMany.mockResolvedValue([route]);
    mocks.routes.findFirst.mockResolvedValue(route);
    mocks.audios.findMany.mockResolvedValue([audio, { ...audio, id: "a2" }]);
    mocks.audios.findFirst.mockResolvedValue(audio);
    mocks.settings.findUnique.mockResolvedValue({ dinnerBreakAudio: { ...audio, category: "common_audio" }, toiletBreakAudio: null, recordsDriveUrl: "https://drive.google.com/drive/folders/123" });
    mocks.pins.findMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (fn) => fn({ $queryRaw: vi.fn(), announcementRoute: mocks.routes, mobilePinnedRoute: mocks.pins, audioAsset: mocks.audios, announcementSettings: mocks.settings }));
  });
  it("requires driver authentication", async () => {
    expect((await fetch(`${base}/mobile/bootstrap`)).status).toBe(401);
    expect((await fetch(`${base}/pins/r1`, { method: "POST" })).status).toBe(401);
    expect((await fetch(`${base}/mobile/sync`, { method: "POST" })).status).toBe(401);
  });
  it("returns route metadata and per-driver pins without shared caching", async () => {
    const response = await request("/mobile/bootstrap");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const { data } = await response.json();
    expect(data.routes).toEqual([{ id: "r1", routeId: "ST-A02", startLocation: "Hyderabad", endLocation: "Amalapuram", via: "Vijayawada", busType: "AC", isPinned: true }]);
    expect(mocks.routes.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ pinnedBy: { where: { userId: "driver-a" }, select: { userId: true } } }) }));
    expect(data.quickAnnouncements[0]).toMatchObject({ type: "MULTIPLE", audios: [{ id: "a1" }, { id: "a2" }] });
    expect(data.quickAnnouncements[1]).toMatchObject({ type: "SINGLE", audioUrl: audio.downloadUrl });
    expect(data.quickAnnouncements[2]).toMatchObject({ type: "SINGLE", audioUrl: null, audio: null });
    expect(data.recordsDriveUrl).toContain("drive.google.com");
  });
  it("exposes explicit sequence with labels and filters unplayable audio", async () => {
    mocks.routes.findFirst.mockResolvedValue({ ...route, audios: [
      { position: 1, stopLabel: "Starting Point", audio },
      { position: 2, stopLabel: null, audio: { ...audio, id: "bad", status: "archived" } },
      { position: 3, stopLabel: null, audio: { ...audio, id: "a3" } },
    ] });
    const { data } = await (await request("/mobile/routes/r1/announcements")).json();
    expect(data.announcements.map((item: { sequence: number }) => item.sequence)).toEqual([1, 3]);
    expect(data.announcements[0].title).toBe("Starting Point");
    expect(mocks.routes.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r1", status: "published" }, select: expect.objectContaining({ audios: expect.objectContaining({ orderBy: { position: "asc" } }) }) }));
  });
  it("rejects unpublished routes and removed playback assets", async () => {
    mocks.routes.findFirst.mockResolvedValue(null);
    mocks.audios.findFirst.mockResolvedValue(null);
    expect((await request("/mobile/routes/r1/announcements")).status).toBe(404);
    expect((await request("/pins/r1", "POST")).status).toBe(404);
    expect((await request("/mobile/audios/a1")).status).toBe(404);
  });
  it("rejects a fourth pin with a useful validation response", async () => {
    mocks.pins.findMany.mockResolvedValue([1, 2, 3].map((slot) => ({ routeId: `r${slot}`, slot })));
    const response = await request("/pins/r4", "POST");
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("PIN_LIMIT_REACHED");
    expect(mocks.pins.create).not.toHaveBeenCalled();
  });
  it("syncs only published pinned playlists with a 30-day lease and deduplicated unchanged response", async () => {
    mocks.pins.findMany.mockResolvedValue([{ route: { ...route, version: 2, audios: [{ position: 3, stopLabel: "Stop label", audio }] } }]);
    const response = await request("/mobile/sync", "POST", {});
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.pinnedRoutes).toHaveLength(1);
    expect(data.pinnedRoutes[0].announcements[0]).toMatchObject({ sequence: 3, title: "Stop label", sizeBytes: 100 });
    expect(data.pinnedRoutes[0].announcements[0].contentRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(Date.parse(data.offlineUntil) - Date.parse(data.serverTime)).toBe(30 * 86_400_000);
    expect(mocks.pins.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "driver-a", route: { status: "published" } }, take: 3 }));
    const { data: same } = await (await request("/mobile/sync", "POST", { revision: data.revision })).json();
    expect(same.unchanged).toBe(true);
    expect(same.catalog).toBeUndefined(); expect(same.pinnedRoutes).toBeUndefined();
    const { data: other } = await (await request("/mobile/sync", "POST", { revision: data.revision }, "driver-b")).json();
    expect(other.unchanged).toBe(false);
  });
  it("metadata edits change snapshot revision without changing media identity; removals send an empty pin set", async () => {
    const pin = { route: { ...route, audios: [{ position: 1, stopLabel: null, audio }] } };
    mocks.pins.findMany.mockResolvedValue([pin]);
    const { data: first } = await (await request("/mobile/sync", "POST", {})).json();
    mocks.pins.findMany.mockResolvedValue([{ route: { ...route, audios: [{ position: 3, stopLabel: "Renamed", audio }] } }]);
    const { data: edited } = await (await request("/mobile/sync", "POST", { revision: first.revision })).json();
    expect(edited.revision).not.toBe(first.revision);
    expect(edited.pinnedRoutes[0].announcements[0].contentRevision).toBe(first.pinnedRoutes[0].announcements[0].contentRevision);
    mocks.pins.findMany.mockResolvedValue([]); mocks.routes.findMany.mockResolvedValue([]);
    const { data: removed } = await (await request("/mobile/sync", "POST", { revision: edited.revision })).json();
    expect(removed.unchanged).toBe(false); expect(removed.pinnedRoutes).toEqual([]); expect(removed.catalog.routes).toEqual([]);
  });
  it("failed snapshots cannot renew an offline lease", async () => {
    mocks.settings.findUnique.mockRejectedValue(new Error("Database unavailable"));
    const response = await request("/mobile/sync", "POST", {});
    expect(response.status).toBe(500); expect((await response.json()).offlineUntil).toBeUndefined();
    expect((await request("/mobile/sync", "POST", { revision: "bad" })).status).toBe(400);
  });
  it("pinning an existing route is idempotent at the limit", async () => {
    mocks.pins.findMany.mockResolvedValue([1, 2, 3].map((slot) => ({ routeId: `r${slot}`, slot })));
    await setRoutePinned("driver-a", "r1", true);
    expect(mocks.pins.create).not.toHaveBeenCalled();
  });
  it("unpins only the authenticated driver's route, even after unpublishing", async () => {
    expect((await request("/pins/r1", "DELETE")).status).toBe(200);
    expect(mocks.pins.deleteMany).toHaveBeenCalledWith({ where: { userId: "driver-a", routeId: "r1" } });
    expect(mocks.routes.findFirst).not.toHaveBeenCalled();
  });
  it("validates common audio selections and Drive URLs in admin configuration", async () => {
    for (const recordsDriveUrl of ["http://drive.google.com/123", "https://drive.google.com.evil.test/123", "javascript:alert(1)"])
      expect((await request("/admin/settings", "PUT", { recordsDriveUrl })).status).toBe(400);
    mocks.audios.count.mockResolvedValue(0);
    expect((await request("/admin/settings", "PUT", { dinnerBreakAudioId: "wrong-category" })).status).toBe(400);
    mocks.audios.count.mockResolvedValue(1);
    mocks.settings.upsert.mockResolvedValue({ id: "default", dinnerBreakAudioId: "common-1" });
    expect((await request("/admin/settings", "PUT", { dinnerBreakAudioId: "common-1", toiletBreakAudioId: "common-1", recordsDriveUrl: "https://drive.google.com/drive/folders/123" })).status).toBe(200);
  });
  it("serializes concurrent pin requests before counting available slots", async () => {
    const pins: { routeId: string; slot: number; userId: string }[] = [];
    let queue = Promise.resolve();
    mocks.transaction.mockImplementation(async (fn) => {
      let unlock: (() => void) | undefined;
      const tx = {
        $queryRaw: async (sql: TemplateStringsArray) => {
          expect(sql.join("?")).toContain("FOR UPDATE");
          const previous = queue;
          queue = new Promise<void>((resolve) => { unlock = resolve; });
          await previous;
        },
        announcementRoute: mocks.routes,
        mobilePinnedRoute: {
          deleteMany: async () => undefined,
          findMany: async () => pins.slice(),
          create: async ({ data }: { data: typeof pins[number] }) => { pins.push(data); },
        },
      };
      try { return await fn(tx); } finally { unlock?.(); }
    });
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => setRoutePinned("driver-a", `r${i}`, true)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    expect(pins).toHaveLength(3);
    expect(new Set(pins.map((pin) => pin.slot)).size).toBe(3);
  });
});
