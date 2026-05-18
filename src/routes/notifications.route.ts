import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, notFound, unauthorized } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  ticketId: true,
  activityLogId: true,
  readAt: true,
  createdAt: true,
  ticket: {
    select: {
      ticketNumber: true,
    },
  },
} satisfies Prisma.NotificationSelect;

const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const parsedQuery = listNotificationsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid notifications query", {
        issues: parsedQuery.error.issues,
      });
    }

    const { page, limit, unreadOnly } = parsedQuery.data;
    const skip = (page - 1) * limit;
    const where = {
      userId: req.user.sub,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
        select: notificationSelect,
      }),
      prisma.notification.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        ticketId: item.ticketId,
        ticketNumber: item.ticket.ticketNumber,
        activityLogId: item.activityLogId,
        readAt: item.readAt,
        createdAt: item.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  }),
);

notificationsRouter.get(
  "/notifications/unread-count",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const count = await prisma.notification.count({
      where: {
        userId: req.user.sub,
        readAt: null,
      },
    });

    res.status(200).json({
      success: true,
      data: { count },
    });
  }),
);

notificationsRouter.patch(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: {
        userId: req.user.sub,
        readAt: null,
      },
      data: { readAt: now },
    });

    res.status(200).json({
      success: true,
      data: { updatedCount: result.count },
    });
  }),
);

notificationsRouter.patch(
  "/notifications/:notificationId/read",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const notificationId = req.params.notificationId;
    if (!notificationId || Array.isArray(notificationId)) {
      throw badRequest("Invalid notification id");
    }

    const existing = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId: req.user.sub,
      },
      select: { id: true, readAt: true },
    });

    if (!existing) {
      throw notFound("Notification not found");
    }

    if (existing.readAt) {
      res.status(200).json({
        success: true,
        data: { id: existing.id, readAt: existing.readAt },
      });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
      select: notificationSelect,
    });

    res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        type: updated.type,
        title: updated.title,
        message: updated.message,
        ticketId: updated.ticketId,
        ticketNumber: updated.ticket.ticketNumber,
        activityLogId: updated.activityLogId,
        readAt: updated.readAt,
        createdAt: updated.createdAt,
      },
    });
  }),
);

export { notificationsRouter };
