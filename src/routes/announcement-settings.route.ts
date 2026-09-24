import { AudioAssetStatus, AudioCategory } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { badRequest, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { serializeAudioAsset } from "../lib/announcement-audio";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";

const settingsPermission = {
  module: "announcements",
  submodule: "settings",
  action: "edit",
};

const updateSettingsSchema = z.object({
  activeWelcomeAudioId: z.string().trim().min(1).nullable(),
});

const announcementSettingsRouter = Router();
announcementSettingsRouter.use(requireAuth);

announcementSettingsRouter.get(
  "/settings",
  requirePermission(settingsPermission),
  asyncHandler(async (_req, res) => {
    const settings = await prisma.announcementSettings.findUnique({
      where: { id: "default" },
      include: { activeWelcomeAudio: true },
    });
    res.status(200).json({
      success: true,
      data: settings
        ? {
            ...settings,
            activeWelcomeAudio: settings.activeWelcomeAudio
              ? serializeAudioAsset(settings.activeWelcomeAudio)
              : null,
          }
        : { id: "default", activeWelcomeAudioId: null, activeWelcomeAudio: null },
    });
  }),
);

announcementSettingsRouter.put(
  "/settings",
  requirePermission(settingsPermission),
  asyncHandler(async (req, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid announcement settings payload", {
        issues: parsed.error.issues,
      });
    }
    if (parsed.data.activeWelcomeAudioId) {
      const audio = await prisma.audioAsset.findFirst({
        where: {
          id: parsed.data.activeWelcomeAudioId,
          category: AudioCategory.welcome_note,
          status: AudioAssetStatus.ready,
        },
        select: { id: true },
      });
      if (!audio) {
        throw notFound("Ready welcome-note audio not found");
      }
    }

    const settings = await prisma.announcementSettings.upsert({
      where: { id: "default" },
      update: {
        activeWelcomeAudioId: parsed.data.activeWelcomeAudioId,
        updatedById: req.user!.sub,
      },
      create: {
        id: "default",
        activeWelcomeAudioId: parsed.data.activeWelcomeAudioId,
        updatedById: req.user!.sub,
      },
      include: { activeWelcomeAudio: true },
    });
    res.status(200).json({
      success: true,
      data: {
        ...settings,
        activeWelcomeAudio: settings.activeWelcomeAudio
          ? serializeAudioAsset(settings.activeWelcomeAudio)
          : null,
      },
    });
  }),
);

export { announcementSettingsRouter };
