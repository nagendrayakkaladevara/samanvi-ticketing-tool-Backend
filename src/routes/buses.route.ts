import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const busHistoryLogSelect = {
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

const busTicketHistorySelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  severity: true,
  priority: true,
  slaDueAt: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: { id: true, name: true },
  },
  assignedTo: {
    select: { id: true, username: true, displayName: true },
  },
  activityLogs: {
    orderBy: [{ createdAt: "asc" }],
    take: 50,
    select: busHistoryLogSelect,
  },
} satisfies Prisma.TicketSelect;

const busTicketsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const isoDateStringSchema = z.string().datetime();

const createBusSchema = z.object({
  busNumber: z.string().trim().min(1).max(50),
  lastMaintenanceDate: isoDateStringSchema.optional(),
});

const updateBusSchema = z
  .object({
    busNumber: z.string().trim().min(1).max(50).optional(),
    lastMaintenanceDate: isoDateStringSchema.nullable().optional(),
  })
  .refine(
    (value) => value.busNumber !== undefined || value.lastMaintenanceDate !== undefined,
    {
      message:
        "At least one field (busNumber or lastMaintenanceDate) must be provided",
    },
  );

const busesRouter = Router();

busesRouter.use(requireAuth);

function normalizeBusNumber(busNumber: string): string {
  return busNumber.trim().toUpperCase();
}

busesRouter.get(
  "/buses",
  asyncHandler(async (_req, res) => {
    const buses = await prisma.bus.findMany({
      orderBy: { busNumber: "asc" },
    });

    res.status(200).json({
      success: true,
      data: {
        items: buses,
      },
    });
  }),
);

busesRouter.get(
  "/buses/:busId/tickets",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const busId = req.params.busId;
    if (!busId || Array.isArray(busId)) {
      throw badRequest("Invalid bus id");
    }

    const parsedQuery = busTicketsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      select: { id: true, busNumber: true },
    });

    if (!bus) {
      throw notFound("Bus not found");
    }

    const where: Prisma.TicketWhereInput = {
      busId,
      ...(req.user.roleCode === "worker"
        ? { assignedToId: req.user.sub }
        : {}),
    };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: parsedQuery.data.limit,
      select: busTicketHistorySelect,
    });

    res.status(200).json({
      success: true,
      data: {
        bus,
        items: tickets,
      },
    });
  }),
);

busesRouter.post(
  "/buses",
  requireFeature("manage_buses"),
  asyncHandler(async (req, res) => {
    const parsedBody = createBusSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid bus payload", {
        issues: parsedBody.error.issues,
      });
    }

    try {
      const bus = await prisma.bus.create({
        data: {
          busNumber: normalizeBusNumber(parsedBody.data.busNumber),
          lastMaintenanceDate: parsedBody.data.lastMaintenanceDate
            ? new Date(parsedBody.data.lastMaintenanceDate)
            : null,
        },
      });

      res.status(201).json({
        success: true,
        data: bus,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Bus number already exists");
      }
      throw error;
    }
  }),
);

busesRouter.patch(
  "/buses/:busId",
  requireFeature("manage_buses"),
  asyncHandler(async (req, res) => {
    const busId = req.params.busId;
    if (!busId || Array.isArray(busId)) {
      throw badRequest("Invalid bus id");
    }

    const parsedBody = updateBusSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid bus payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existingBus = await prisma.bus.findUnique({
      where: { id: busId },
      select: { id: true },
    });

    if (!existingBus) {
      throw notFound("Bus not found");
    }

    try {
      const bus = await prisma.bus.update({
        where: { id: busId },
        data: {
          ...(parsedBody.data.busNumber !== undefined
            ? { busNumber: normalizeBusNumber(parsedBody.data.busNumber) }
            : {}),
          ...(parsedBody.data.lastMaintenanceDate !== undefined
            ? {
                lastMaintenanceDate: parsedBody.data.lastMaintenanceDate
                  ? new Date(parsedBody.data.lastMaintenanceDate)
                  : null,
              }
            : {}),
        },
      });

      res.status(200).json({
        success: true,
        data: bus,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Bus number already exists");
      }
      throw error;
    }
  }),
);

export { busesRouter };
