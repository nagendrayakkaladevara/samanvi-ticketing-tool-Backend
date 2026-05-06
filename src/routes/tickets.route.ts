import {
  Prisma,
  RoleCode,
  TicketActivityType,
  TicketPriority,
  TicketSeverity,
  TicketStatus,
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type { AccessTokenPayload } from "../auth/auth.service";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, forbidden, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const isoDateStringSchema = z.string().datetime();

const createTicketSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1),
  severity: z.nativeEnum(TicketSeverity),
  priority: z.nativeEnum(TicketPriority),
  categoryId: z.string().trim().min(1),
  busNumber: z.string().trim().min(1).max(50),
  slaDueAt: isoDateStringSchema,
});

const ticketListQuerySchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  severity: z.nativeEnum(TicketSeverity).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  categoryId: z.string().trim().min(1).optional(),
  busId: z.string().trim().min(1).optional(),
  assignedToId: z.string().trim().min(1).optional(),
  includeUnassigned: z.coerce.boolean().default(true),
});

const assignTicketSchema = z.object({
  assignedToId: z.string().trim().min(1),
  note: z.string().trim().min(1).max(2_000).optional(),
});

const updateTicketStatusSchema = z.object({
  status: z.enum([
    TicketStatus.assigned,
    TicketStatus.in_progress,
    TicketStatus.blocked,
    TicketStatus.resolved,
    TicketStatus.closed,
  ]),
  note: z.string().trim().min(1).max(2_000).optional(),
});

const createTicketCommentSchema = z.object({
  note: z.string().trim().min(1).max(2_000),
});

const reopenTicketSchema = z.object({
  note: z.string().trim().min(1).max(2_000),
});

const allowedStatusTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.created]: [TicketStatus.assigned],
  [TicketStatus.assigned]: [TicketStatus.in_progress, TicketStatus.blocked],
  [TicketStatus.in_progress]: [TicketStatus.resolved, TicketStatus.blocked],
  [TicketStatus.blocked]: [TicketStatus.assigned, TicketStatus.in_progress],
  [TicketStatus.resolved]: [TicketStatus.closed],
  [TicketStatus.closed]: [],
  [TicketStatus.reopened]: [TicketStatus.assigned, TicketStatus.in_progress, TicketStatus.blocked],
};

function formatStatusList(statuses: readonly TicketStatus[]): string {
  return statuses.map((status) => toDisplayStatus(status)).join(", ");
}

function toDisplayStatus(status: TicketStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildInvalidTransitionMessage(
  currentStatus: TicketStatus,
  requestedStatus: TicketStatus,
  allowedTransitions: readonly TicketStatus[],
): string {
  if (allowedTransitions.length === 0) {
    return `You cannot move this ticket from ${toDisplayStatus(
      currentStatus,
    )}. It is in a final state. Use reopen to continue work.`;
  }

  return `You cannot move this ticket from ${toDisplayStatus(
    currentStatus,
  )} to ${toDisplayStatus(requestedStatus)}. Allowed next status: ${formatStatusList(
    allowedTransitions,
  )}.`;
}

const ticketActivityLogSelect = {
  id: true,
  actionType: true,
  fromStatus: true,
  toStatus: true,
  note: true,
  createdAt: true,
  actor: {
    select: {
      id: true,
      username: true,
      displayName: true,
    },
  },
} satisfies Prisma.TicketActivityLogSelect;

function recalculateSlaDueAt({
  slaDurationMs,
  reopenedAt,
}: {
  slaDurationMs: bigint;
  reopenedAt: Date;
}): Date {
  const dueEpochMs = BigInt(reopenedAt.getTime()) + slaDurationMs;
  return new Date(Number(dueEpochMs));
}

const ticketSelect = {
  id: true,
  title: true,
  description: true,
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
  activityLogs: {
    orderBy: [{ createdAt: "desc" }],
    select: ticketActivityLogSelect,
  },
} satisfies Prisma.TicketSelect;

type TicketRecord = Prisma.TicketGetPayload<{
  select: typeof ticketSelect;
}>;

type TicketWithOverdue = TicketRecord & {
  isOverdue: boolean;
  overdueDurationMs: number;
};

const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

function assertTicketId(ticketId: string | string[] | undefined): string {
  if (!ticketId || Array.isArray(ticketId)) {
    throw badRequest("Invalid ticket id");
  }
  return ticketId;
}

async function findVisibleTicketOrThrow(
  ticketId: string,
  viewer: AccessTokenPayload,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: ticketSelect,
  });

  if (!ticket) {
    throw notFound("Ticket not found");
  }

  if (viewer.roleCode === "worker" && ticket.assignedTo?.id !== viewer.sub) {
    throw notFound("Ticket not found");
  }

  return ticket;
}

function toTicketWithOverdue(
  ticket: TicketRecord,
  now: Date = new Date(),
): TicketWithOverdue {
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

function toTicketListWithOverdue(
  tickets: TicketRecord[],
  now: Date = new Date(),
): TicketWithOverdue[] {
  return tickets.map((ticket) => toTicketWithOverdue(ticket, now));
}

async function resolveBusIdForTicketCreation(
  tx: Prisma.TransactionClient,
  busNumberInput: string,
): Promise<string> {
  const normalized = busNumberInput.trim().toLowerCase();
  const existing = await tx.bus.findFirst({
    where: {
      busNumber: { equals: normalized, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await tx.bus.create({
      data: { busNumber: normalized },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const afterConflict = await tx.bus.findFirst({
        where: {
          busNumber: { equals: normalized, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (afterConflict) return afterConflict.id;
    }
    throw error;
  }
}

ticketsRouter.post(
  "/tickets",
  requireFeature("create_ticket"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const parsedBody = createTicketSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid ticket payload", {
        issues: parsedBody.error.issues,
      });
    }

    const category = await prisma.issueCategory.findUnique({
      where: { id: parsedBody.data.categoryId },
      select: { id: true, isActive: true },
    });

    if (!category) {
      throw badRequest("Issue category not found");
    }
    if (!category.isActive) {
      throw badRequest("Issue category is inactive");
    }

    const actorUserId = req.user.sub;

    const ticket = await prisma.$transaction(async (tx) => {
      const busId = await resolveBusIdForTicketCreation(
        tx,
        parsedBody.data.busNumber,
      );
      const slaDueAt = new Date(parsedBody.data.slaDueAt);
      const createdTicket = await tx.ticket.create({
        data: {
          title: parsedBody.data.title,
          description: parsedBody.data.description,
          severity: parsedBody.data.severity,
          priority: parsedBody.data.priority,
          categoryId: parsedBody.data.categoryId,
          busId,
          slaDueAt,
          slaDurationMs: 0n,
          createdById: actorUserId,
          status: TicketStatus.created,
        },
        select: { id: true, createdAt: true },
      });

      const slaDurationMs = BigInt(
        Math.max(slaDueAt.getTime() - createdTicket.createdAt.getTime(), 0),
      );
      await tx.ticket.update({
        where: { id: createdTicket.id },
        data: { slaDurationMs },
      });

      await tx.ticketActivityLog.create({
        data: {
          ticketId: createdTicket.id,
          actorUserId,
          actionType: TicketActivityType.created,
          toStatus: TicketStatus.created,
        },
      });

      return tx.ticket.findUniqueOrThrow({
        where: { id: createdTicket.id },
        select: ticketSelect,
      });
    });

    res.status(201).json({
      success: true,
      data: toTicketWithOverdue(ticket),
    });
  }),
);

ticketsRouter.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const parsedQuery = ticketListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid tickets query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const isWorker = req.user.roleCode === "worker";
    const where: Prisma.TicketWhereInput = {
      ...(parsedQuery.data.status ? { status: parsedQuery.data.status } : {}),
      ...(parsedQuery.data.severity ? { severity: parsedQuery.data.severity } : {}),
      ...(parsedQuery.data.priority ? { priority: parsedQuery.data.priority } : {}),
      ...(parsedQuery.data.categoryId
        ? { categoryId: parsedQuery.data.categoryId }
        : {}),
      ...(parsedQuery.data.busId ? { busId: parsedQuery.data.busId } : {}),
    };

    if (isWorker) {
      where.assignedToId = req.user.sub;
    } else if (parsedQuery.data.assignedToId) {
      where.assignedToId = parsedQuery.data.assignedToId;
    } else if (!parsedQuery.data.includeUnassigned) {
      where.assignedToId = { not: null };
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      select: ticketSelect,
    });

    const now = new Date();
    res.status(200).json({
      success: true,
      data: {
        items: toTicketListWithOverdue(tickets, now),
      },
    });
  }),
);

ticketsRouter.get(
  "/tickets/my",
  requireFeature("update_status"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    if (req.user.roleCode !== "worker") {
      throw forbidden("Only workers can access assigned my tickets view");
    }

    const parsedQuery = ticketListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid tickets query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const where: Prisma.TicketWhereInput = {
      assignedToId: req.user.sub,
      ...(parsedQuery.data.status ? { status: parsedQuery.data.status } : {}),
      ...(parsedQuery.data.severity ? { severity: parsedQuery.data.severity } : {}),
      ...(parsedQuery.data.priority ? { priority: parsedQuery.data.priority } : {}),
      ...(parsedQuery.data.categoryId
        ? { categoryId: parsedQuery.data.categoryId }
        : {}),
      ...(parsedQuery.data.busId ? { busId: parsedQuery.data.busId } : {}),
    };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      select: ticketSelect,
    });

    const now = new Date();
    res.status(200).json({
      success: true,
      data: {
        items: toTicketListWithOverdue(tickets, now),
      },
    });
  }),
);

ticketsRouter.get(
  "/tickets/:ticketId",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const ticketId = assertTicketId(req.params.ticketId);
    const ticket = await findVisibleTicketOrThrow(ticketId, req.user);

    res.status(200).json({
      success: true,
      data: toTicketWithOverdue(ticket),
    });
  }),
);

ticketsRouter.get(
  "/tickets/:ticketId/timeline",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const ticketId = assertTicketId(req.params.ticketId);
    await findVisibleTicketOrThrow(ticketId, req.user);

    const activity = await prisma.ticketActivityLog.findMany({
      where: { ticketId },
      orderBy: [{ createdAt: "asc" }],
      select: ticketActivityLogSelect,
    });

    res.status(200).json({
      success: true,
      data: {
        ticketId,
        items: activity,
      },
    });
  }),
);

ticketsRouter.post(
  "/tickets/:ticketId/assign",
  requireFeature("assign_ticket"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const ticketId = assertTicketId(req.params.ticketId);
    const parsedBody = assignTicketSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid assign payload", {
        issues: parsedBody.error.issues,
      });
    }

    const [ticket, worker] = await Promise.all([
      prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          status: true,
          assignedToId: true,
        },
      }),
      prisma.user.findFirst({
        where: {
          id: parsedBody.data.assignedToId,
          isActive: true,
          role: {
            code: RoleCode.worker,
          },
        },
        select: { id: true },
      }),
    ]);

    if (!ticket) {
      throw notFound("Ticket not found");
    }

    if (!worker) {
      throw badRequest("Assigned user must be an active worker");
    }

    if (ticket.status === TicketStatus.closed) {
      throw badRequest("Closed tickets cannot be reassigned");
    }

    const nextStatus =
      ticket.status === TicketStatus.created || ticket.status === TicketStatus.reopened
        ? TicketStatus.assigned
        : ticket.status;

    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: {
          assignedToId: worker.id,
          assignedById: req.user.sub,
          assignedAt: new Date(),
          status: nextStatus,
        },
      }),
      prisma.ticketActivityLog.create({
        data: {
          ticketId,
          actorUserId: req.user.sub,
          actionType: TicketActivityType.assigned,
          fromStatus: ticket.status,
          toStatus: nextStatus,
          note: parsedBody.data.note,
        },
      }),
    ]);

    const updatedTicket = await findVisibleTicketOrThrow(ticketId, req.user);
    res.status(200).json({
      success: true,
      data: toTicketWithOverdue(updatedTicket),
    });
  }),
);

ticketsRouter.patch(
  "/tickets/:ticketId/status",
  requireFeature("update_status"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const ticketId = assertTicketId(req.params.ticketId);
    const parsedBody = updateTicketStatusSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid ticket status payload", {
        issues: parsedBody.error.issues,
      });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        assignedToId: true,
        resolvedAt: true,
        closedAt: true,
      },
    });

    if (!ticket) {
      throw notFound("Ticket not found");
    }

    if (req.user.roleCode === "worker" && ticket.assignedToId !== req.user.sub) {
      throw notFound("Ticket not found");
    }

    const allowedTransitions = allowedStatusTransitions[ticket.status];
    if (!allowedTransitions.includes(parsedBody.data.status)) {
      throw badRequest(
        buildInvalidTransitionMessage(
          ticket.status,
          parsedBody.data.status,
          allowedTransitions,
        ),
      );
    }

    if (parsedBody.data.status === TicketStatus.resolved && !parsedBody.data.note) {
      throw badRequest(
        "A note is required before changing status to Resolved. Please add a short resolution note and try again.",
      );
    }

    if (parsedBody.data.status === TicketStatus.blocked && !parsedBody.data.note) {
      throw badRequest(
        "A note is required before changing status to Blocked. Please explain what is blocking this ticket and try again.",
      );
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: parsedBody.data.status,
          ...(parsedBody.data.status === TicketStatus.resolved
            ? { resolvedAt: now }
            : {}),
          ...(parsedBody.data.status === TicketStatus.closed ? { closedAt: now } : {}),
          ...(parsedBody.data.status === TicketStatus.in_progress ? { resolvedAt: null } : {}),
          ...(parsedBody.data.status !== TicketStatus.closed && ticket.closedAt
            ? { closedAt: null }
            : {}),
        },
      }),
      prisma.ticketActivityLog.create({
        data: {
          ticketId,
          actorUserId: req.user.sub,
          actionType:
            parsedBody.data.status === TicketStatus.closed
              ? TicketActivityType.closed
              : TicketActivityType.status_changed,
          fromStatus: ticket.status,
          toStatus: parsedBody.data.status,
          note: parsedBody.data.note,
        },
      }),
    ]);

    const updatedTicket = await findVisibleTicketOrThrow(ticketId, req.user);
    res.status(200).json({
      success: true,
      data: toTicketWithOverdue(updatedTicket),
    });
  }),
);

ticketsRouter.post(
  "/tickets/:ticketId/reopen",
  requireFeature("update_status"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const ticketId = assertTicketId(req.params.ticketId);
    const parsedBody = reopenTicketSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid reopen payload", {
        issues: parsedBody.error.issues,
      });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        slaDueAt: true,
        slaDurationMs: true,
        assignedToId: true,
        reopenedCount: true,
      },
    });

    if (!ticket) {
      throw notFound("Ticket not found");
    }

    if (req.user.roleCode === "worker" && ticket.assignedToId !== req.user.sub) {
      throw notFound("Ticket not found");
    }

    if (
      ticket.status !== TicketStatus.resolved &&
      ticket.status !== TicketStatus.closed
    ) {
      throw badRequest(
        `You can reopen a ticket only when it is Resolved or Closed. Current status is ${toDisplayStatus(
          ticket.status,
        )}.`,
      );
    }

    const reopenedAt = new Date();
    const slaDurationMs =
      ticket.slaDurationMs > 0n
        ? ticket.slaDurationMs
        : BigInt(
            Math.max(ticket.slaDueAt.getTime() - ticket.createdAt.getTime(), 0),
          );
    const recalculatedSlaDueAt = recalculateSlaDueAt({
      slaDurationMs,
      reopenedAt,
    });

    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.reopened,
          reopenedCount: ticket.reopenedCount + 1,
          resolvedAt: null,
          closedAt: null,
          slaDueAt: recalculatedSlaDueAt,
          ...(ticket.slaDurationMs === 0n ? { slaDurationMs } : {}),
        },
      }),
      prisma.ticketActivityLog.create({
        data: {
          ticketId,
          actorUserId: req.user.sub,
          actionType: TicketActivityType.reopened,
          fromStatus: ticket.status,
          toStatus: TicketStatus.reopened,
          note: parsedBody.data.note,
        },
      }),
    ]);

    const updatedTicket = await findVisibleTicketOrThrow(ticketId, req.user);
    res.status(200).json({
      success: true,
      data: toTicketWithOverdue(updatedTicket),
    });
  }),
);

ticketsRouter.post(
  "/tickets/:ticketId/comments",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const ticketId = assertTicketId(req.params.ticketId);
    const parsedBody = createTicketCommentSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid comment payload", {
        issues: parsedBody.error.issues,
      });
    }

    await findVisibleTicketOrThrow(ticketId, req.user);

    const comment = await prisma.ticketActivityLog.create({
      data: {
        ticketId,
        actorUserId: req.user.sub,
        actionType: TicketActivityType.commented,
        note: parsedBody.data.note,
      },
      select: ticketActivityLogSelect,
    });

    res.status(201).json({
      success: true,
      data: comment,
    });
  }),
);

ticketsRouter.delete(
  "/tickets/:ticketId",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }
    if (req.user.roleCode !== RoleCode.admin) {
      throw forbidden("Only administrators can delete tickets");
    }

    const ticketId = assertTicketId(req.params.ticketId);
    const existing = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Ticket not found");
    }

    await prisma.ticket.delete({ where: { id: ticketId } });

    res.status(200).json({
      success: true,
      data: { id: ticketId },
    });
  }),
);

export { ticketsRouter };