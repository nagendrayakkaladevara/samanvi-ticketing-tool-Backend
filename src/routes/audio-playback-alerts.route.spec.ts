import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), user: vi.fn(), audio: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: {
  audioPlaybackAlert: mocks, mobileDriverUser: { findUnique: mocks.user }, audioAsset: { findUnique: mocks.audio },
  $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
} }));
vi.mock("../lib/mobile-announcements", () => ({ MAX_PINNED_ROUTES: 3, mobileAudioSelect: {}, mobileRouteSelect: {} }));
vi.mock("../lib/mobile-offline-sync", () => ({ OFFLINE_AUDIO_DAYS: 7 }));
vi.mock("../middleware/mobile-auth", () => ({ requireMobileDriverAuth: (req: any, res: any, next: any) => {
  if (req.headers["x-deny-auth"]) return res.sendStatus(401);
  req.mobileDriver = { sub: "driver-1" }; next();
} }));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, res: any, next: any) => { if (req.headers["x-deny-auth"]) return res.sendStatus(401); req.user = { sub: "admin-1" }; next(); },
  requirePermission: () => (req: any, res: any, next: any) => { if (req.headers["x-deny-permission"]) return res.sendStatus(403); next(); },
}));
import { audioPlaybackAlertsRouter } from "./audio-playback-alerts.route";
import { mobileAnnouncementsRouter } from "./mobile-announcements.route";

describe("Audio playback alerts", () => {
  let server: Server;
  let base: string;
  const event = { eventId: "f14a32a8-6f06-4a3c-8bc1-6f30d4ce56d0", audioId: "audio-1", playCount: 4, playedAt: "2026-01-01T10:00:00.000Z" };
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/mobile", mobileAnnouncementsRouter);
    app.use("/admin", audioPlaybackAlertsRouter);
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ message: error.message }));
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ displayName: "Driver One", username: "driverone" });
    mocks.audio.mockResolvedValue({ title: "Welcome" });
    mocks.findUnique.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
  });
  const post = (body: unknown, headers = {}) => fetch(`${base}/mobile/playback-alerts`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  it("records authenticated identity and original offline playback time", async () => {
    expect((await post(event)).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {}, create: expect.objectContaining({ userId: "driver-1", audioTitle: "Welcome", displayName: "Driver One", playCount: 4, playedAt: new Date(event.playedAt) }) }));
  });
  it("acknowledges delivery retries without reopening a read alert", async () => {
    mocks.findUnique.mockResolvedValue({ id: "alert-1", readAt: new Date() });
    expect((await post(event)).status).toBe(200);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([{ ...event, playCount: 3 }, { ...event, userId: "forged" }, { ...event, eventId: "invalid" }, { ...event, playedAt: "2999-01-01T00:00:00.000Z" }])("rejects invalid or forged events", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("requires mobile authentication", async () => { expect((await post(event, { "x-deny-auth": "1" })).status).toBe(401); });
  it("returns paginated history and the total unread count", async () => {
    mocks.count.mockResolvedValueOnce(35).mockResolvedValueOnce(2);
    const response = await fetch(`${base}/admin/playback-alerts?page=2`);
    expect((await response.json()).data).toMatchObject({ total: 35, unreadCount: 2, page: 2 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 30, take: 30 }));
  });
  it("requires alert permission on reads and acknowledgements", async () => {
    expect((await fetch(`${base}/admin/playback-alerts`, { headers: { "x-deny-permission": "1" } })).status).toBe(403);
    expect((await fetch(`${base}/admin/playback-alerts/alert-1/read`, { method: "PATCH", headers: { "x-deny-permission": "1" } })).status).toBe(403);
  });
  it("marks only unread alerts and records the acknowledging admin", async () => {
    mocks.findUnique.mockResolvedValue({ id: "alert-1" });
    expect((await fetch(`${base}/admin/playback-alerts/alert-1/read`, { method: "PATCH" })).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "alert-1", readAt: null }, data: { readAt: expect.any(Date), readById: "admin-1" } });
  });
  it("returns not found for missing alerts", async () => { expect((await fetch(`${base}/admin/playback-alerts/missing/read`, { method: "PATCH" })).status).toBe(404); });
});
