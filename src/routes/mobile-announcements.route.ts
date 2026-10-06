import { Router } from "express";
import { z } from "zod";
import { badRequest, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { prisma } from "../lib/prisma";
import { requireMobileDriverAuth } from "../middleware/mobile-auth";
import {
  getQuickAnnouncements, listMobileRoutes, listPinnedRoutes, MAX_PINNED_ROUTES,
  mobileAudioSelect, mobileRouteSelect, playableAudio, routeCard, setRoutePinned,
} from "../lib/mobile-announcements";

function routeIdFrom(params: { routeId?: string | string[] }): string {
  if (!params.routeId || Array.isArray(params.routeId)) throw badRequest("Invalid route id");
  return params.routeId;
}

const mobileAnnouncementsRouter = Router();
mobileAnnouncementsRouter.use(requireMobileDriverAuth);
mobileAnnouncementsRouter.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });

mobileAnnouncementsRouter.get("/bootstrap", asyncHandler(async (req, res) => {
  const [routes, quickAnnouncements, settings] = await Promise.all([
    listMobileRoutes(req.mobileDriver!.sub), getQuickAnnouncements(),
    prisma.announcementSettings.findUnique({ where: { id: "default" }, select: { recordsDriveUrl: true } }),
  ]);
  res.json({ success: true, data: { routes, quickAnnouncements, recordsDriveUrl: settings?.recordsDriveUrl ?? null, maxPinnedRoutes: MAX_PINNED_ROUTES } });
}));

mobileAnnouncementsRouter.get("/routes", asyncHandler(async (req, res) => {
  const parsed = z.object({ search: z.string().trim().max(150).optional() }).safeParse(req.query);
  if (!parsed.success) throw badRequest("Invalid route query", { issues: parsed.error.issues });
  res.json({ success: true, data: { routes: await listMobileRoutes(req.mobileDriver!.sub, parsed.data.search) } });
}));

mobileAnnouncementsRouter.get("/routes/:routeId/announcements", asyncHandler(async (req, res) => {
  const route = await prisma.announcementRoute.findFirst({
    where: { id: routeIdFrom(req.params), status: "published" },
    select: {
      ...mobileRouteSelect,
      pinnedBy: { where: { userId: req.mobileDriver!.sub }, select: { userId: true } },
      audios: { where: { audio: { status: "ready" } }, orderBy: { position: "asc" }, select: { position: true, stopLabel: true, audio: { select: mobileAudioSelect } } },
    },
  });
  if (!route) throw notFound("Published announcement route not found");
  res.json({ success: true, data: {
    routeId: route.routeCode, route: routeCard(route, route.pinnedBy.length > 0),
    announcements: route.audios.flatMap(({ audio, position, stopLabel }) => {
      const playable = playableAudio(audio);
      return playable ? [{ ...playable, title: stopLabel || playable.title, sequence: position }] : [];
    }),
  } });
}));

mobileAnnouncementsRouter.get("/quick-announcements", asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { quickAnnouncements: await getQuickAnnouncements() } });
}));

mobileAnnouncementsRouter.get("/config", asyncHandler(async (_req, res) => {
  const settings = await prisma.announcementSettings.findUnique({ where: { id: "default" }, select: { recordsDriveUrl: true } });
  res.json({ success: true, data: { recordsDriveUrl: settings?.recordsDriveUrl ?? null } });
}));

// Resolve each play request against the backend, so removed or unpublished audio cannot
// continue to play from stale screen data and the app always needs a live connection.
mobileAnnouncementsRouter.get("/audios/:audioId", asyncHandler(async (req, res) => {
  const audioId = z.string().min(1).parse(req.params.audioId);
  const audio = await prisma.audioAsset.findFirst({
    where: { id: audioId, status: "ready", OR: [
      { category: "welcome_note" },
      { category: "common_audio", dinnerInSettings: { some: { id: "default" } } },
      { category: "common_audio", toiletInSettings: { some: { id: "default" } } },
      { category: "stop_announcement", routeAssignments: { some: { route: { status: "published" } } } },
    ] },
    select: mobileAudioSelect,
  });
  const playable = playableAudio(audio);
  if (!playable) throw notFound("This announcement is no longer available");
  res.json({ success: true, data: playable });
}));

const mobilePinnedRoutesRouter = Router();
mobilePinnedRoutesRouter.use(requireMobileDriverAuth);
mobilePinnedRoutesRouter.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
mobilePinnedRoutesRouter.get("/", asyncHandler(async (req, res) => {
  res.json({ success: true, data: { routes: await listPinnedRoutes(req.mobileDriver!.sub), maxPinnedRoutes: MAX_PINNED_ROUTES } });
}));
for (const method of ["post", "delete"] as const) {
  mobilePinnedRoutesRouter[method]("/:routeId", asyncHandler(async (req, res) => {
    await setRoutePinned(req.mobileDriver!.sub, routeIdFrom(req.params), method === "post");
    res.json({ success: true, data: { routes: await listPinnedRoutes(req.mobileDriver!.sub), maxPinnedRoutes: MAX_PINNED_ROUTES } });
  }));
}

export { mobileAnnouncementsRouter, mobilePinnedRoutesRouter };
