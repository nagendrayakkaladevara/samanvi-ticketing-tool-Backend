import { Prisma, RoleCode, TicketStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const dashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
});

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireFeature("view_dashboard"));

dashboardRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const parsed = dashboardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid dashboard query params", {
        issues: parsed.error.issues,
      });
    }

    const { days } = parsed.data;
    const now = new Date();
    const isWorker = req.user.roleCode === "worker";

    const baseWhere: Prisma.TicketWhereInput = isWorker
      ? { assignedToId: req.user.sub }
      : {};

    const overdueWhere: Prisma.TicketWhereInput = {
      ...baseWhere,
      status: { not: TicketStatus.closed },
      slaDueAt: { lt: now },
    };

    const [total, byStatus, overdueTicketsForAvg, closedCount, resolvedTicketsForAvg, resolvedForDaily] =
      await Promise.all([
        prisma.ticket.count({ where: baseWhere }),
        prisma.ticket.groupBy({
          by: ["status"],
          where: baseWhere,
          _count: true,
        }),
        prisma.ticket.findMany({
          where: overdueWhere,
          select: { slaDueAt: true },
        }),
        prisma.ticket.count({
          where: {
            ...baseWhere,
            status: TicketStatus.closed,
          },
        }),
        prisma.ticket.findMany({
          where: {
            ...baseWhere,
            resolvedAt: { not: null },
          },
          select: {
            createdAt: true,
            resolvedAt: true,
          },
        }),
        prisma.ticket.findMany({
          where: {
            ...baseWhere,
            resolvedAt: {
              gte: addUtcDays(startOfUtcDay(now), -(days - 1)),
            },
          },
          select: { resolvedAt: true },
        }),
      ]);

    const statusCounts = Object.fromEntries(
      byStatus.map((row) => [row.status, row._count]),
    ) as Partial<Record<TicketStatus, number>>;

    const overdueCount = overdueTicketsForAvg.length;
    const averageOverdueTimeMs =
      overdueTicketsForAvg.length > 0
        ? Math.round(
            overdueTicketsForAvg.reduce(
              (sum, t) => sum + (now.getTime() - t.slaDueAt.getTime()),
              0,
            ) / overdueTicketsForAvg.length,
          )
        : null;

    const averageResolutionTimeMs =
      resolvedTicketsForAvg.length > 0
        ? Math.round(
            resolvedTicketsForAvg.reduce(
              (sum, t) =>
                sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
              0,
            ) / resolvedTicketsForAvg.length,
          )
        : null;

    const resolvedPerDayMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = addUtcDays(startOfUtcDay(now), -(days - 1 - i));
      resolvedPerDayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const t of resolvedForDaily) {
      if (!t.resolvedAt) continue;
      const key = startOfUtcDay(t.resolvedAt).toISOString().slice(0, 10);
      if (resolvedPerDayMap.has(key)) {
        resolvedPerDayMap.set(key, (resolvedPerDayMap.get(key) ?? 0) + 1);
      }
    }
    const resolvedPerDay = [...resolvedPerDayMap.entries()].map(([date, count]) => ({
      date,
      count,
    }));

    let workerMetrics: Array<{
      userId: string;
      username: string;
      displayName: string;
      assignedOpenCount: number;
      resolvedCount: number;
    }>;

    if (isWorker) {
      const [assignedOpenCount, resolvedCount] = await Promise.all([
        prisma.ticket.count({
          where: {
            assignedToId: req.user.sub,
            status: { not: TicketStatus.closed },
          },
        }),
        prisma.ticket.count({
          where: {
            assignedToId: req.user.sub,
            resolvedAt: { not: null },
          },
        }),
      ]);
      workerMetrics = [
        {
          userId: req.user.sub,
          username: req.user.username,
          displayName: req.user.displayName,
          assignedOpenCount,
          resolvedCount,
        },
      ];
    } else {
      const [openByWorker, resolvedByWorker, workers] = await Promise.all([
        prisma.ticket.groupBy({
          by: ["assignedToId"],
          where: {
            assignedToId: { not: null },
            status: { not: TicketStatus.closed },
          },
          _count: true,
        }),
        prisma.ticket.groupBy({
          by: ["assignedToId"],
          where: {
            assignedToId: { not: null },
            resolvedAt: { not: null },
          },
          _count: true,
        }),
        prisma.user.findMany({
          where: {
            role: { code: RoleCode.worker },
            isActive: true,
          },
          select: { id: true, username: true, displayName: true },
          orderBy: { displayName: "asc" },
        }),
      ]);

      const openMap = new Map(
        openByWorker.map((r) => [r.assignedToId!, r._count]),
      );
      const resolvedMap = new Map(
        resolvedByWorker.map((r) => [r.assignedToId!, r._count]),
      );

      workerMetrics = workers.map((w) => ({
        userId: w.id,
        username: w.username,
        displayName: w.displayName,
        assignedOpenCount: openMap.get(w.id) ?? 0,
        resolvedCount: resolvedMap.get(w.id) ?? 0,
      }));
    }

    const busWhere: Prisma.TicketWhereInput = isWorker
      ? { assignedToId: req.user.sub }
      : {};

    const [totalByBus, openByBus, buses] = await Promise.all([
      prisma.ticket.groupBy({
        by: ["busId"],
        where: busWhere,
        _count: true,
      }),
      prisma.ticket.groupBy({
        by: ["busId"],
        where: {
          ...busWhere,
          status: { not: TicketStatus.closed },
        },
        _count: true,
      }),
      prisma.bus.findMany({
        select: { id: true, busNumber: true },
      }),
    ]);

    const busNumberById = new Map(buses.map((b) => [b.id, b.busNumber]));
    const openMap = new Map(openByBus.map((r) => [r.busId, r._count]));

    const busMetrics = totalByBus
      .map((row) => ({
        busId: row.busId,
        busNumber: busNumberById.get(row.busId) ?? row.busId,
        ticketCount: row._count,
        openTicketCount: openMap.get(row.busId) ?? 0,
      }))
      .sort((a, b) => b.openTicketCount - a.openTicketCount || b.ticketCount - a.ticketCount);

    const mostProblematicBuses = busMetrics.slice(0, 10);

    res.status(200).json({
      success: true,
      data: {
        scope: isWorker ? "assigned_to_me" : "global",
        generatedAt: now.toISOString(),
        ticketMetrics: {
          total,
          byStatus: statusCounts,
          overdueCount,
          averageOverdueTimeMs,
          completedClosedCount: closedCount,
          averageResolutionTimeMs,
          resolvedPerDay,
        },
        workerMetrics,
        busMetrics: {
          items: busMetrics,
          mostProblematicBuses,
        },
      },
    });
  }),
);

export { dashboardRouter };
