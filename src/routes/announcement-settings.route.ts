import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";
import { mobileAudioSelect, playableAudio } from "../lib/mobile-announcements";

const settingsPermission = { module: "announcements", submodule: "settings", action: "edit" };
export const updateSettingsSchema = z.object({
  dinnerBreakAudioId: z.string().trim().min(1).nullable().optional(),
  toiletBreakAudioId: z.string().trim().min(1).nullable().optional(),
  recordsDriveUrl: z.string().trim().max(1000).url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "drive.google.com" && !url.username && !url.password;
  }, "Enter an HTTPS Google Drive URL").nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one setting");
const select = { id: true, dinnerBreakAudioId: true, toiletBreakAudioId: true, recordsDriveUrl: true };
const announcementSettingsRouter = Router();
announcementSettingsRouter.use(requireAuth);

announcementSettingsRouter.get("/settings", requirePermission(settingsPermission), asyncHandler(async (_req, res) => {
  const settings = await prisma.announcementSettings.findUnique({ where: { id: "default" }, select });
  res.json({ success: true, data: settings ?? { id: "default", dinnerBreakAudioId: null, toiletBreakAudioId: null, recordsDriveUrl: null } });
}));

announcementSettingsRouter.put("/settings", requirePermission(settingsPermission), asyncHandler(async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid announcement settings payload", { issues: parsed.error.issues });
  const ids = [...new Set([parsed.data.dinnerBreakAudioId, parsed.data.toiletBreakAudioId].filter((id): id is string => !!id))];
  const count = await prisma.audioAsset.count({ where: { id: { in: ids }, category: "common_audio", status: "ready" } });
  if (count !== ids.length) throw badRequest("Dinner and Toilet Break must use ready common audio files");
  const settings = await prisma.announcementSettings.upsert({
    where: { id: "default" },
    update: { ...parsed.data, updatedById: req.user!.sub },
    create: { id: "default", ...parsed.data, updatedById: req.user!.sub },
    select,
  });
  res.json({ success: true, data: settings });
}));

const breakMappingSchema = z.object({
  target: z.enum(["dinner_break", "toilet_break", "both", "none"]),
}).strict();

// Categories stay backward compatible: these are assignments of common audio,
// not new asset categories. The same settings drive old and new mobile clients.
announcementSettingsRouter.put("/audios/:audioId/break-mapping", requirePermission(settingsPermission), asyncHandler(async (req, res) => {
  const parsed = breakMappingSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Choose Dinner Break, Toilet Break, both, or no mapping", { issues: parsed.error.issues });
  const audioId = req.params.audioId;
  if (!audioId || Array.isArray(audioId)) throw badRequest("Invalid audio id");
  const target = parsed.data.target;
  try {
    const settings = await prisma.$transaction(async (tx) => {
      // Keep the asset from being deleted or changed while it is assigned.
      await tx.$queryRaw`SELECT "id" FROM "AudioAsset" WHERE "id" = ${audioId} FOR UPDATE`;
      const audio = await tx.audioAsset.findUnique({ where: { id: audioId }, select: mobileAudioSelect });
      if (!audio) throw notFound("Audio asset not found");
      if (audio.category !== "common_audio") throw badRequest("Break buttons must use Common audio");
      if (target !== "none" && !playableAudio(audio)) throw conflict("Break mapping requires verified Common audio with a secure playback URL");
      const existing = await tx.announcementSettings.findUnique({ where: { id: "default" }, select });
      const data = {
        updatedById: req.user!.sub,
        ...(target === "dinner_break" || target === "both" ? { dinnerBreakAudioId: audioId } : existing?.dinnerBreakAudioId === audioId ? { dinnerBreakAudioId: null } : {}),
        ...(target === "toilet_break" || target === "both" ? { toiletBreakAudioId: audioId } : existing?.toiletBreakAudioId === audioId ? { toiletBreakAudioId: null } : {}),
      };
      return tx.announcementSettings.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data }, select });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json({ success: true, data: settings });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw conflict("The audio mapping changed at the same time. Refresh and try again");
    }
    throw error;
  }
}));

export { announcementSettingsRouter };
