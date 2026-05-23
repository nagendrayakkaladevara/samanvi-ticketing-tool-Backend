import {
  Prisma,
  TicketPriority,
  TicketSeverity,
  TicketStatus,
} from "@prisma/client";
import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import type { AccessTokenPayload } from "../auth/auth.service";
import { canAccessFeature } from "../auth/roles";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, forbidden, notFound, unauthorized } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const ticketRelationSchema = z.enum(["assigned", "created", "acted_on"]);

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const userTicketsQuerySchema = paginationQuerySchema.extend({
  relation: ticketRelationSchema.default("assigned"),
  status: z.nativeEnum(TicketStatus).optional(),
  severity: z.nativeEnum(TicketSeverity).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  categoryId: z.string().trim().min(1).optional(),
  busId: z.string().trim().min(1).optional(),
});

const userActivityQuerySchema = paginationQuerySchema;

const userMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(90).default(14),
});

const userHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(90).default(14),
  recentLimit: z.coerce.number().int().min(1).max(20).default(5),
});

const targetUserSelect = {
  id: true,
  username: true,
  displayName: true,
  isActive: true,
  role: {
    select: {
      code: true,
      label: true,
    },
  },
} satisfies Prisma.UserSelect;

const userHistoryTicketSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  severity: true,
  priority: true,
  slaDueAt: true,
  assignedAt: true,
  resolvedAt: true,
  closedAt: true,
  reopenedCount: true,
  createdAt: true,
  updatedAt: true,
  bus: {
    select: {
      id: true,
      busNumber: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      username: true,
      displayName: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      username: true,
      displayName: true,
    },
  },
} satisfies Prisma.TicketSelect;

type UserHistoryTicketRecord = Prisma.TicketGetPayload<{
  select: typeof userHistoryTicketSelect;
}>;

type UserHistoryTicketWithOverdue = UserHistoryTicketRecord & {
  isOverdue: boolean;
  overdueDurationMs: number;
};

const activityFeedSelect = {
  id: true,
  actionType: true,
  fromStatus: true,
  toStatus: true,
  note: true,
  createdAt: true,
  ticket: {
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      bus: {
        select: {
          busNumber: true,
        },
      },
    },
  },
} satisfies Prisma.TicketActivityLogSelect;

const userHistoryRouter = Router();

userHistoryRouter.use(requireAuth);

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function paginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}

function resolveTargetUserId(req: Request): string {
  if (!req.user) {
    throw unauthorized("Authentication required");
  }

  const rawUserId = req.params.userId;
  if (!rawUserId || Array.isArray(rawUserId)) {
    throw badRequest("Invalid user id");
  }

  if (rawUserId === "me") {
    return req.user.sub;
  }

  return rawUserId;
}

function assertCanViewUserHistory(
  viewer: AccessTokenPayload,
  targetUserId: string,
): void {
  if (viewer.sub === targetUserId) {
    return;
  }

  if (viewer.roleCode === "worker") {
    throw forbidden("Workers can only view their own history");
  }

  if (!canAccessFeature(viewer.roleCode, "view_dashboard")) {
    throw forbidden(
      "You are not allowed to view another user's history (requires view_dashboard)",
    );
  }
}

async function loadTargetUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: targetUserSelect,
  });

  if (!user) {
    throw notFound("User not found");
  }

  return user;
}

function toTicketWithOverdue(
  ticket: UserHistoryTicketRecord,
  now: Date = new Date(),
): UserHistoryTicketWithOverdue {
  if (ticket.status === TicketStatus.closed) {
    return {
      ...ticket,
      isOverdue: false,
      overdueDurationMs: 0,
    };
  }

  const overdueDurationMs = Math.max(now.getTime() - ticket.slaDueAt.getTime(), 0);
  return {
    ...ticket,
    isOverdue: overdueDurationMs > 0,
    overdueDurationMs,
  };
}

function buildTicketFilters(
  parsed: z.infer<typeof userTicketsQuerySchema>,
): Prisma.TicketWhereInput {
  return {
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(parsed.severity ? { severity: parsed.severity } : {}),
    ...(parsed.priority ? { priority: parsed.priority } : {}),
    ...(parsed.categoryId ? { categoryId: parsed.categoryId } : {}),
    ...(parsed.busId ? { busId: parsed.busId } : {}),
  };
}

function buildTicketWhereForRelation(
  relation: z.infer<typeof ticketRelationSchema>,
  userId: string,
  filters: Prisma.TicketWhereInput,
): Prisma.TicketWhereInput {
  switch (relation) {
    case "assigned":
      return {
        assignedToId: userId,
        ...filters,
      };
    case "created":
      return {
        createdById: userId,
        ...filters,
      };
    case "acted_on":
      return {
        activityLogs: {
          some: { actorUserId: userId },
        },
        ...filters,
      };
    default:
      return filters;
  }
}

async function countTicketsByRelation(userId: string) {
  const [assigned, created, actedOn] = await Promise.all([
    prisma.ticket.count({ where: { assignedToId: userId } }),
    prisma.ticket.count({ where: { createdById: userId } }),
    prisma.ticket.count({
      where: {
        activityLogs: { some: { actorUserId: userId } },
      },
    }),
  ]);

  return { assigned, created, actedOn };
}

async function countTicketsByStatus(where: Prisma.TicketWhereInput) {
  const rows = await prisma.ticket.groupBy({
    by: ["status"],
    where,
    _count: true,
  });

  return Object.fromEntries(rows.map((row) => [row.status, row._count]));
}

async function buildUserMetrics(userId: string, days: number) {
  const now = new Date();
  const windowStart = addUtcDays(startOfUtcDay(now), -Math.max(days - 1, 0));

  const assignedWhere: Prisma.TicketWhereInput = { assignedToId: userId };

  const [
    assignedOpenCount,
    totalAssignedCount,
    resolvedInWindow,
    resolvedAllTime,
    overdueOpen,
  ] = await Promise.all([
    prisma.ticket.count({
      where: {
        ...assignedWhere,
        status: { not: TicketStatus.closed },
      },
    }),
    prisma.ticket.count({ where: assignedWhere }),
    prisma.ticket.findMany({
      where: {
        ...assignedWhere,
        resolvedAt: {
          gte: windowStart,
          lte: now,
        },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
        slaDueAt: true,
      },
    }),
    prisma.ticket.count({
      where: {
        ...assignedWhere,
        resolvedAt: { not: null },
      },
    }),
    prisma.ticket.count({
      where: {
        ...assignedWhere,
        status: { not: TicketStatus.closed },
        slaDueAt: { lt: now },
      },
    }),
  ]);

  const resolvedPerDayMap = new Map<string, number>();
  for (const row of resolvedInWindow) {
    if (!row.resolvedAt) continue;
    const key = startOfUtcDay(row.resolvedAt).toISOString().slice(0, 10);
    resolvedPerDayMap.set(key, (resolvedPerDayMap.get(key) ?? 0) + 1);
  }

  const resolvedPerDay = [...resolvedPerDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const resolvedWithTimestamps = resolvedInWindow.filter((row) => row.resolvedAt);
  const resolutionDurationsMs = resolvedWithTimestamps.map(
    (row) => row.resolvedAt!.getTime() - row.createdAt.getTime(),
  );
  const averageResolutionTimeMs =
    resolutionDurationsMs.length > 0
      ? Math.round(
          resolutionDurationsMs.reduce((sum, value) => sum + value, 0) /
            resolutionDurationsMs.length,
        )
      : null;

  const withinSlaResolved = resolvedWithTimestamps.filter(
    (row) => row.resolvedAt!.getTime() <= row.slaDueAt.getTime(),
  ).length;
  const slaCompliancePercent =
    resolvedWithTimestamps.length > 0
      ? round2((withinSlaResolved / resolvedWithTimestamps.length) * 100)
      : null;

  return {
    window: {
      days,
      fromInclusive: windowStart.toISOString(),
      toInclusive: now.toISOString(),
    },
    assigned: {
      totalCount: totalAssignedCount,
      openCount: assignedOpenCount,
      overdueOpenCount: overdueOpen,
      resolvedAllTimeCount: resolvedAllTime,
      resolvedInWindowCount: resolvedInWindow.length,
      resolvedPerDay,
      averageResolutionTimeMs,
      slaCompliancePercent,
    },
    created: {
      totalCount: await prisma.ticket.count({ where: { createdById: userId } }),
    },
    actedOn: {
      distinctTicketCount: await prisma.ticket.count({
        where: {
          activityLogs: { some: { actorUserId: userId } },
        },
      }),
      activityCount: await prisma.ticketActivityLog.count({
        where: { actorUserId: userId },
      }),
    },
  };
}

userHistoryRouter.get(
  "/users/:userId/tickets",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const targetUserId = resolveTargetUserId(req);
    assertCanViewUserHistory(req.user, targetUserId);

    const parsedQuery = userTicketsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid user tickets query params", {
        issues: parsedQuery.error.issues,
      });
    }

    await loadTargetUser(targetUserId);

    const { page, limit, relation } = parsedQuery.data;
    const skip = (page - 1) * limit;
    const filters = buildTicketFilters(parsedQuery.data);
    const where = buildTicketWhereForRelation(relation, targetUserId, filters);

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip,
        take: limit,
        select: userHistoryTicketSelect,
      }),
      prisma.ticket.count({ where }),
    ]);

    const now = new Date();
    res.status(200).json({
      success: true,
      data: {
        userId: targetUserId,
        relation,
        items: tickets.map((ticket) => toTicketWithOverdue(ticket, now)),
      },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

userHistoryRouter.get(
  "/users/:userId/activity",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const targetUserId = resolveTargetUserId(req);
    assertCanViewUserHistory(req.user, targetUserId);

    const parsedQuery = userActivityQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid user activity query params", {
        issues: parsedQuery.error.issues,
      });
    }

    await loadTargetUser(targetUserId);

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;
    const where = { actorUserId: targetUserId };

    const [items, total] = await Promise.all([
      prisma.ticketActivityLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
        select: activityFeedSelect,
      }),
      prisma.ticketActivityLog.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        userId: targetUserId,
        items: items.map((item) => ({
          id: item.id,
          actionType: item.actionType,
          fromStatus: item.fromStatus,
          toStatus: item.toStatus,
          note: item.note,
          createdAt: item.createdAt,
          ticket: item.ticket,
        })),
      },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

userHistoryRouter.get(
  "/users/:userId/metrics",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const targetUserId = resolveTargetUserId(req);
    assertCanViewUserHistory(req.user, targetUserId);

    const parsedQuery = userMetricsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid user metrics query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const targetUser = await loadTargetUser(targetUserId);
    const metrics = await buildUserMetrics(targetUserId, parsedQuery.data.days);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: targetUser.id,
          username: targetUser.username,
          displayName: targetUser.displayName,
          role: targetUser.role,
        },
        generatedAt: new Date().toISOString(),
        metrics,
      },
    });
  }),
);

userHistoryRouter.get(
  "/users/:userId/history",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const targetUserId = resolveTargetUserId(req);
    assertCanViewUserHistory(req.user, targetUserId);

    const parsedQuery = userHistoryQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid user history query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const targetUser = await loadTargetUser(targetUserId);
    const { days, recentLimit } = parsedQuery.data;
    const now = new Date();

    const [ticketCounts, assignedByStatus, createdByStatus, metrics, recentAssigned, recentCreated, recentActivity] =
      await Promise.all([
        countTicketsByRelation(targetUserId),
        countTicketsByStatus({ assignedToId: targetUserId }),
        countTicketsByStatus({ createdById: targetUserId }),
        buildUserMetrics(targetUserId, days),
        prisma.ticket.findMany({
          where: { assignedToId: targetUserId },
          orderBy: [{ updatedAt: "desc" }],
          take: recentLimit,
          select: userHistoryTicketSelect,
        }),
        prisma.ticket.findMany({
          where: { createdById: targetUserId },
          orderBy: [{ createdAt: "desc" }],
          take: recentLimit,
          select: userHistoryTicketSelect,
        }),
        prisma.ticketActivityLog.findMany({
          where: { actorUserId: targetUserId },
          orderBy: [{ createdAt: "desc" }],
          take: recentLimit,
          select: activityFeedSelect,
        }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: targetUser.id,
          username: targetUser.username,
          displayName: targetUser.displayName,
          role: targetUser.role,
        },
        generatedAt: now.toISOString(),
        ticketCounts,
        ticketsByStatus: {
          assigned: assignedByStatus,
          created: createdByStatus,
        },
        metrics,
        recent: {
          assignedTickets: recentAssigned.map((ticket) =>
            toTicketWithOverdue(ticket, now),
          ),
          createdTickets: recentCreated.map((ticket) =>
            toTicketWithOverdue(ticket, now),
          ),
          activity: recentActivity.map((item) => ({
            id: item.id,
            actionType: item.actionType,
            fromStatus: item.fromStatus,
            toStatus: item.toStatus,
            note: item.note,
            createdAt: item.createdAt,
            ticket: item.ticket,
          })),
        },
      },
    });
  }),
);

export { userHistoryRouter };
