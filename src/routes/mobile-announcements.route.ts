import {
  AnnouncementRouteStatus,
  AudioAssetStatus,
  AudioCategory,
  Prisma,
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { badRequest, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { serializeAudioAsset } from "../lib/announcement-audio";
import { prisma } from "../lib/prisma";

const mobileRouteQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
});

const publicAudioSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  originalFileName: true,
  mimeType: true,
  sizeBytes: true,
  durationMs: true,
  checksumSha256: true,
  status: true,
  blobUrl: true,
  downloadUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AudioAssetSelect;

function routeIdFrom(params: { routeId?: string | string[] }): string {
  if (!params.routeId || Array.isArray(params.routeId)) {
    throw badRequest("Invalid route id");
  }
  return params.routeId;
}

const mobileAnnouncementsRouter = Router();

// Mobile authentication is intentionally added later when its login design is finalized.
// These endpoints return only published, non-sensitive announcement content.
mobileAnnouncementsRouter.get(
  "/bootstrap",
  asyncHandler(async (_req, res) => {
    const [settings, commonAudios, routes] = await Promise.all([
      prisma.announcementSettings.findUnique({
        where: { id: "default" },
        select: { activeWelcomeAudio: { select: publicAudioSelect } },
      }),
      prisma.audioAsset.findMany({
        where: { category: AudioCategory.common_audio, status: AudioAssetStatus.ready },
        select: publicAudioSelect,
        orderBy: { title: "asc" },
      }),
      prisma.announcementRoute.findMany({
        where: { status: AnnouncementRouteStatus.published },
        orderBy: { name: "asc" },
        select: {
          id: true,
          routeCode: true,
          name: true,
          origin: true,
          destination: true,
          version: true,
          updatedAt: true,
          _count: { select: { audios: true } },
        },
      }),
    ]);

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.status(200).json({
      success: true,
      data: {
        welcomeAudio: settings?.activeWelcomeAudio
          ? serializeAudioAsset(settings.activeWelcomeAudio)
          : null,
        commonAudios: commonAudios.map(serializeAudioAsset),
        routes,
      },
    });
  }),
);

mobileAnnouncementsRouter.get(
  "/routes",
  asyncHandler(async (req, res) => {
    const parsed = mobileRouteQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid route query", { issues: parsed.error.issues });
    }
    const routes = await prisma.announcementRoute.findMany({
      where: {
        status: AnnouncementRouteStatus.published,
        ...(parsed.data.search
          ? {
              OR: [
                { routeCode: { contains: parsed.data.search, mode: "insensitive" } },
                { name: { contains: parsed.data.search, mode: "insensitive" } },
                { origin: { contains: parsed.data.search, mode: "insensitive" } },
                { destination: { contains: parsed.data.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        routeCode: true,
        name: true,
        origin: true,
        destination: true,
        description: true,
        version: true,
        updatedAt: true,
        _count: { select: { audios: true } },
      },
    });
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.status(200).json({ success: true, data: { items: routes } });
  }),
);

mobileAnnouncementsRouter.get(
  "/routes/:routeId/manifest",
  asyncHandler(async (req, res) => {
    const routeId = routeIdFrom(req.params);
    const route = await prisma.announcementRoute.findFirst({
      where: { id: routeId, status: AnnouncementRouteStatus.published },
      select: {
        id: true,
        routeCode: true,
        name: true,
        origin: true,
        destination: true,
        description: true,
        version: true,
        updatedAt: true,
        audios: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            stopLabel: true,
            audio: { select: publicAudioSelect },
          },
        },
      },
    });
    if (!route) {
      throw notFound("Published announcement route not found");
    }
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.status(200).json({
      success: true,
      data: {
        ...route,
        audios: route.audios.map((assignment) => ({
          ...assignment,
          audio: serializeAudioAsset(assignment.audio),
        })),
      },
    });
  }),
);

export { mobileAnnouncementsRouter };
