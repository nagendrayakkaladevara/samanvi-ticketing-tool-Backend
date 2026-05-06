import { Prisma, RoleCode, TicketSeverity, TicketStatus } from "@prisma/client";
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

function toHours(valueMs: number | null): number | null {
  if (valueMs === null) return null;
  return Math.round((valueMs / 3_600_000) * 100) / 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

    const [
      total,
      byStatus,
      openBySeverityRows,
      overdueTicketsForAvg,
      closedCount,
      resolvedTicketsForAvg,
      resolvedForDaily,
    ] =
      await Promise.all([
        prisma.ticket.count({ where: baseWhere }),
        prisma.ticket.groupBy({
          by: ["status"],
          where: baseWhere,
          _count: true,
        }),
        prisma.ticket.groupBy({
          by: ["severity"],
          where: {
            ...baseWhere,
            status: { not: TicketStatus.closed },
          },
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

    const openBySeverityCounts = {
      [TicketSeverity.critical]: 0,
      [TicketSeverity.high]: 0,
      [TicketSeverity.medium]: 0,
      [TicketSeverity.low]: 0,
    } as Record<TicketSeverity, number>;

    for (const row of openBySeverityRows) {
      openBySeverityCounts[row.severity] = row._count;
    }

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
          openBySeverity: openBySeverityCounts,
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

dashboardRouter.get(
  "/dashboard/admin-summary",
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
    const windowStart = addUtcDays(startOfUtcDay(now), -(days - 1));

    const isWorker = req.user.roleCode === "worker";
    const scopeWhere: Prisma.TicketWhereInput = isWorker
      ? { assignedToId: req.user.sub }
      : {};
    const openStatuses = {
      in: [
        TicketStatus.created,
        TicketStatus.assigned,
        TicketStatus.in_progress,
        TicketStatus.blocked,
        TicketStatus.reopened,
      ],
    } satisfies Prisma.EnumTicketStatusFilter;

    const [
      totalOpen,
      totalClosed,
      createdInWindow,
      resolvedInWindow,
      unassignedOpen,
      oldestOpen,
      openByPriorityRows,
      openByStatusRows,
      openBySeverityRows,
      overdueOpenCount,
      atRiskOpenCount,
      openByAssigneeRows,
      workers,
      resolvedForDuration,
    ] = await Promise.all([
      prisma.ticket.count({
        where: {
          ...scopeWhere,
          status: openStatuses,
        },
      }),
      prisma.ticket.count({
        where: {
          ...scopeWhere,
          status: TicketStatus.closed,
        },
      }),
      prisma.ticket.count({
        where: {
          ...scopeWhere,
          createdAt: {
            gte: windowStart,
            lte: now,
          },
        },
      }),
      prisma.ticket.count({
        where: {
          ...scopeWhere,
          resolvedAt: {
            gte: windowStart,
            lte: now,
          },
        },
      }),
      prisma.ticket.count({
        where: {
          ...scopeWhere,
          status: openStatuses,
          assignedToId: null,
        },
      }),
      prisma.ticket.findFirst({
        where: {
          ...scopeWhere,
          status: openStatuses,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          createdAt: true,
          ticketNumber: true,
          priority: true,
          status: true,
        },
      }),
      prisma.ticket.groupBy({
        by: ["priority"],
        where: {
          ...scopeWhere,
          status: openStatuses,
        },
        _count: true,
      }),
      prisma.ticket.groupBy({
        by: ["status"],
        where: {
          ...scopeWhere,
          status: openStatuses,
        },
        _count: true,
      }),
      prisma.ticket.groupBy({
        by: ["severity"],
        where: {
          ...scopeWhere,
          status: openStatuses,
        },
        _count: true,
      }),
      prisma.ticket.count({
        where: {
          ...scopeWhere,
          status: openStatuses,
          slaDueAt: { lt: now },
        },
      }),
      prisma.ticket.count({
        where: {
          ...scopeWhere,
          status: openStatuses,
          slaDueAt: { gte: now, lte: addUtcDays(now, 1) },
        },
      }),
      prisma.ticket.groupBy({
        by: ["assignedToId"],
        where: {
          ...scopeWhere,
          status: openStatuses,
          assignedToId: { not: null },
        },
        _count: true,
      }),
      prisma.user.findMany({
        where: {
          role: { code: RoleCode.worker },
          isActive: true,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
        },
        orderBy: {
          displayName: "asc",
        },
      }),
      prisma.ticket.findMany({
        where: {
          ...scopeWhere,
          resolvedAt: {
            gte: windowStart,
            lte: now,
          },
        },
        select: {
          createdAt: true,
          resolvedAt: true,
          slaDueAt: true,
          assignedToId: true,
        },
      }),
    ]);

    const resolvedWithTimestamps = resolvedForDuration.filter(
      (row) => row.resolvedAt !== null,
    );
    const resolutionDurationsMs = resolvedWithTimestamps.map((row) =>
      row.resolvedAt!.getTime() - row.createdAt.getTime(),
    );
    const totalResolutionMs = resolutionDurationsMs.reduce((sum, x) => sum + x, 0);
    const averageResolutionTimeMs =
      resolutionDurationsMs.length > 0
        ? Math.round(totalResolutionMs / resolutionDurationsMs.length)
        : null;
    const withinSlaResolved = resolvedWithTimestamps.filter(
      (row) => row.resolvedAt!.getTime() <= row.slaDueAt.getTime(),
    ).length;
    const slaCompliancePercent =
      resolvedWithTimestamps.length > 0
        ? round2((withinSlaResolved / resolvedWithTimestamps.length) * 100)
        : null;

    const resolvedByWorkerMap = new Map<string, number>();
    for (const row of resolvedWithTimestamps) {
      if (!row.assignedToId) continue;
      resolvedByWorkerMap.set(
        row.assignedToId,
        (resolvedByWorkerMap.get(row.assignedToId) ?? 0) + 1,
      );
    }

    const openByWorkerMap = new Map(
      openByAssigneeRows.map((row) => [row.assignedToId!, row._count]),
    );

    const workerLeaderboard = workers
      .map((worker) => ({
        userId: worker.id,
        username: worker.username,
        displayName: worker.displayName,
        openAssignedCount: openByWorkerMap.get(worker.id) ?? 0,
        resolvedInWindow: resolvedByWorkerMap.get(worker.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.resolvedInWindow - a.resolvedInWindow ||
          a.openAssignedCount - b.openAssignedCount,
      )
      .slice(0, 10);

    const priorityOpenCounts = Object.fromEntries(
      openByPriorityRows.map((row) => [row.priority, row._count]),
    );
    const statusOpenCounts = Object.fromEntries(
      openByStatusRows.map((row) => [row.status, row._count]),
    );
    const severityOpenCounts = {
      [TicketSeverity.critical]: 0,
      [TicketSeverity.high]: 0,
      [TicketSeverity.medium]: 0,
      [TicketSeverity.low]: 0,
      ...Object.fromEntries(openBySeverityRows.map((row) => [row.severity, row._count])),
    };

    const oldestOpenAgeMs = oldestOpen ? now.getTime() - oldestOpen.createdAt.getTime() : null;

    res.status(200).json({
      success: true,
      data: {
        scope: isWorker ? "assigned_to_me" : "global",
        generatedAt: now.toISOString(),
        window: {
          days,
          fromInclusive: windowStart.toISOString(),
          toInclusive: now.toISOString(),
        },
        snapshot: {
          openTickets: totalOpen,
          closedTickets: totalClosed,
          newTicketsInWindow: createdInWindow,
          resolvedTicketsInWindow: resolvedInWindow,
          unassignedOpenTickets: unassignedOpen,
          oldestOpenTicketAgeMs: oldestOpenAgeMs,
          oldestOpenTicketAgeHours: toHours(oldestOpenAgeMs),
          oldestOpenTicket: oldestOpen
            ? {
                id: oldestOpen.id,
                ticketNumber: oldestOpen.ticketNumber,
                priority: oldestOpen.priority,
                status: oldestOpen.status,
              }
            : null,
        },
        queue: {
          openByPriority: priorityOpenCounts,
          openByStatus: statusOpenCounts,
          openBySeverity: severityOpenCounts,
        },
        sla: {
          overdueOpenCount,
          atRiskOpenCount,
          resolvedWithinSlaCount: withinSlaResolved,
          resolvedInWindowCount: resolvedWithTimestamps.length,
          slaCompliancePercent,
        },
        speed: {
          averageResolutionTimeMs,
          averageResolutionTimeHours: toHours(averageResolutionTimeMs),
        },
        agentLeaderboard: workerLeaderboard,
      },
    });
  }),
);

export { dashboardRouter };
