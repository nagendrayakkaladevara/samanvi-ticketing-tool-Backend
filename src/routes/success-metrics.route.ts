import { Prisma, RoleCode, TicketStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

/**
 * PRD §14 success metrics. Rolling UTC window is based on ticket `resolvedAt`
 * (SLA compliance, resolution-time percentiles, worker throughput) and
 * `createdAt` for “repeated issues” (same bus + category, ≥2 tickets).
 */

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(30),
});

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function medianMs(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function percentileMs(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.round((sorted.length - 1) * p);
  return sorted[idx]!;
}

const successMetricsRouter = Router();

successMetricsRouter.use(requireAuth, requireFeature("view_dashboard"));

successMetricsRouter.get(
  "/metrics/success",
  asyncHandler(async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      throw badRequest("Authenticated user context is required");
    }

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid query params", { issues: parsed.error.issues });
    }

    const { days } = parsed.data;
    const now = new Date();
    const windowStart = addUtcDays(startOfUtcDay(now), -(days - 1));

    const isWorker = authUser.roleCode === "worker";

    const baseWhere: Prisma.TicketWhereInput = isWorker
      ? { assignedToId: authUser.sub }
      : {};

    const resolvedInWindowWhere: Prisma.TicketWhereInput = {
      ...baseWhere,
      resolvedAt: {
        gte: windowStart,
        lte: now,
      },
    };

    const resolvedInWindow = await prisma.ticket.findMany({
      where: resolvedInWindowWhere,
      select: {
        id: true,
        resolvedAt: true,
        slaDueAt: true,
        createdAt: true,
        assignedToId: true,
      },
    });

    const withinSlaCount = resolvedInWindow.filter(
      (t) => t.resolvedAt && t.resolvedAt.getTime() <= t.slaDueAt.getTime(),
    ).length;
    const resolvedCount = resolvedInWindow.length;
    const percentResolvedWithinSla =
      resolvedCount > 0
        ? Math.round((10000 * withinSlaCount) / resolvedCount) / 100
        : null;

    const resolutionDurationsMs = resolvedInWindow
      .filter((t) => t.resolvedAt)
      .map((t) => t.resolvedAt!.getTime() - t.createdAt.getTime());

    const averageResolutionTimeMs =
      resolutionDurationsMs.length > 0
        ? Math.round(
            resolutionDurationsMs.reduce((a, b) => a + b, 0) /
              resolutionDurationsMs.length,
          )
        : null;

    const createdInWindowWhere: Prisma.TicketWhereInput = {
      ...baseWhere,
      createdAt: { gte: windowStart, lte: now },
    };

    const ticketsForRepeats = await prisma.ticket.findMany({
      where: createdInWindowWhere,
      select: {
        busId: true,
        categoryId: true,
        bus: { select: { busNumber: true } },
        category: { select: { name: true } },
      },
    });

    const pairCounts = new Map<
      string,
      { busId: string; categoryId: string; busNumber: string; categoryName: string; count: number }
    >();

    for (const t of ticketsForRepeats) {
      const key = `${t.busId}:${t.categoryId}`;
      const existing = pairCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        pairCounts.set(key, {
          busId: t.busId,
          categoryId: t.categoryId,
          busNumber: t.bus.busNumber,
          categoryName: t.category.name,
          count: 1,
        });
      }
    }

    const repeatedIssueGroups = [...pairCounts.values()]
      .filter((g) => g.count >= 2)
      .sort((a, b) => b.count - a.count || a.busNumber.localeCompare(b.busNumber));

    const ticketsInRepeatGroups = repeatedIssueGroups.reduce(
      (sum, g) => sum + g.count,
      0,
    );

    let workerEfficiency: Array<{
      userId: string;
      username: string;
      displayName: string;
      resolvedInWindow: number;
      resolvedPerDay: number;
    }>;

    if (isWorker) {
      const resolved = resolvedInWindow.filter(
        (t) => t.assignedToId === authUser.sub,
      ).length;
      workerEfficiency = [
        {
          userId: authUser.sub,
          username: authUser.username,
          displayName: authUser.displayName,
          resolvedInWindow: resolved,
          resolvedPerDay:
            Math.round((10000 * resolved) / days) / 10000,
        },
      ];
    } else {
      const byWorker = new Map<string, number>();
      for (const t of resolvedInWindow) {
        if (!t.assignedToId) continue;
        byWorker.set(t.assignedToId, (byWorker.get(t.assignedToId) ?? 0) + 1);
      }

      const workers = await prisma.user.findMany({
        where: {
          role: { code: RoleCode.worker },
          isActive: true,
        },
        select: { id: true, username: true, displayName: true },
        orderBy: { displayName: "asc" },
      });

      workerEfficiency = workers.map((w) => {
        const resolved = byWorker.get(w.id) ?? 0;
        return {
          userId: w.id,
          username: w.username,
          displayName: w.displayName,
          resolvedInWindow: resolved,
          resolvedPerDay:
            Math.round((10000 * resolved) / days) / 10000,
        };
      });
    }

    const openNotClosedCount = await prisma.ticket.count({
      where: {
        ...baseWhere,
        status: { not: TicketStatus.closed },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        scope: isWorker ? "assigned_to_me" : "global",
        definitions: {
          windowUtc: {
            days,
            fromInclusive: windowStart.toISOString(),
            toInclusive: now.toISOString(),
          },
          slaCompliance:
            "Share of tickets with resolvedAt in the window where resolvedAt <= slaDueAt (latest row).",
          resolutionTime:
            "resolvedAt - createdAt for tickets resolved in the window; mean, median, and 90th percentile in ms.",
          repeatedIssues:
            "Groups with the same bus + issue category and at least two tickets created in the window (PRD: repeated issues per bus).",
          workerEfficiency:
            "resolvedInWindow / days (UTC calendar days in the window length), per worker.",
        },
        slaCompliance: {
          resolvedInWindow: resolvedCount,
          resolvedWithinSlaCount: withinSlaCount,
          percentResolvedWithinSla,
          breachedSlaCount:
            resolvedCount > 0 ? resolvedCount - withinSlaCount : 0,
        },
        resolutionTime: {
          sampleCount: resolutionDurationsMs.length,
          averageResolutionTimeMs,
          medianResolutionTimeMs: medianMs(resolutionDurationsMs),
          p90ResolutionTimeMs: percentileMs(resolutionDurationsMs, 0.9),
        },
        repeatedIssues: {
          rule: "same busId + categoryId, ticket count >= 2, created in window",
          groupCount: repeatedIssueGroups.length,
          ticketsInRepeatGroups,
          groups: repeatedIssueGroups,
        },
        workerEfficiency,
        context: {
          openNotClosedTicketCount: openNotClosedCount,
          generatedAt: now.toISOString(),
        },
      },
    });
  }),
);

export { successMetricsRouter };
