import { Router } from "express";
import { z } from "zod";
import { badRequest } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";

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

export { announcementSettingsRouter };
