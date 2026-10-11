import { Router } from "express";
import { z } from "zod";
import { badRequest, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";

const audioPlaybackAlertsRouter = Router();
audioPlaybackAlertsRouter.use(requireAuth);
const alertPermission = requirePermission({ module: "announcements", submodule: "mobile_users", action: "view" });
audioPlaybackAlertsRouter.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
audioPlaybackAlertsRouter.get("/playback-alerts", alertPermission, asyncHandler(async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).default(1) }).safeParse(req.query);
  if (!parsed.success) throw badRequest("Invalid alert page");
  const page = parsed.data.page;
  const [items, total, unreadCount] = await prisma.$transaction([
    prisma.audioPlaybackAlert.findMany({ orderBy: [{ playedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 30, take: 30 }),
    prisma.audioPlaybackAlert.count(), prisma.audioPlaybackAlert.count({ where: { readAt: null } }),
  ]);
  res.json({ success: true, data: { items, total, unreadCount, page } });
}));
audioPlaybackAlertsRouter.patch("/playback-alerts/:id/read", alertPermission, asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!id || Array.isArray(id)) throw badRequest("Invalid alert id");
  const exists = await prisma.audioPlaybackAlert.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound("Playback alert not found");
  await prisma.audioPlaybackAlert.updateMany({ where: { id, readAt: null }, data: { readAt: new Date(), readById: req.user!.sub } });
  res.json({ success: true, data: { id } });
}));
export { audioPlaybackAlertsRouter };
