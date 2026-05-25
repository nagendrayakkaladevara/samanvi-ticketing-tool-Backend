import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import {
  ddMmYyyySchema,
  formatDdMmYyyy,
  normalizeBusNumber,
  optionalDdMmYyyySchema,
  paginationMeta,
  paginationQuerySchema,
  parseDdMmYyyy,
} from "../lib/master";
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

const busSelect = {
  id: true,
  busNumber: true,
  engineNumber: true,
  chassisNumber: true,
  purchaseDate: true,
  odometer: true,
  insuranceValidity: true,
  pollutionValidity: true,
  fcValidity: true,
  basePermitValidity: true,
  homeTaxValidity: true,
  aitpValidity: true,
  aitpAuthorizationValidity: true,
  serviceOutDate: true,
  remarks: true,
  lastMaintenanceDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BusSelect;

const busTicketsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const createBusSchema = z.object({
  busNumber: z.string().trim().min(1).max(50),
  engineNumber: z.string().trim().min(1).max(80),
  chassisNumber: z.string().trim().min(1).max(80),
  purchaseDate: optionalDdMmYyyySchema,
  odometer: z.coerce.number().int().nonnegative(),
  insuranceValidity: ddMmYyyySchema,
  pollutionValidity: optionalDdMmYyyySchema,
  fcValidity: optionalDdMmYyyySchema,
  basePermitValidity: optionalDdMmYyyySchema,
  homeTaxValidity: optionalDdMmYyyySchema,
  aitpValidity: optionalDdMmYyyySchema,
  aitpAuthorizationValidity: optionalDdMmYyyySchema,
  serviceOutDate: optionalDdMmYyyySchema,
  remarks: z.string().trim().max(500).optional(),
  lastMaintenanceDate: optionalDdMmYyyySchema,
});

const updateBusSchema = createBusSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

function serializeBus(bus: Prisma.BusGetPayload<{ select: typeof busSelect }>) {
  return {
    ...bus,
    purchaseDate: formatDdMmYyyy(bus.purchaseDate),
    insuranceValidity: formatDdMmYyyy(bus.insuranceValidity)!,
    pollutionValidity: formatDdMmYyyy(bus.pollutionValidity),
    fcValidity: formatDdMmYyyy(bus.fcValidity),
    basePermitValidity: formatDdMmYyyy(bus.basePermitValidity),
    homeTaxValidity: formatDdMmYyyy(bus.homeTaxValidity),
    aitpValidity: formatDdMmYyyy(bus.aitpValidity),
    aitpAuthorizationValidity: formatDdMmYyyy(bus.aitpAuthorizationValidity),
    serviceOutDate: formatDdMmYyyy(bus.serviceOutDate),
    lastMaintenanceDate: formatDdMmYyyy(bus.lastMaintenanceDate),
  };
}

function buildBusWriteData(
  data: z.infer<typeof createBusSchema>,
): Prisma.BusCreateInput {
  return {
    busNumber: normalizeBusNumber(data.busNumber),
    engineNumber: data.engineNumber,
    chassisNumber: data.chassisNumber,
    purchaseDate: data.purchaseDate ? parseDdMmYyyy(data.purchaseDate) : null,
    odometer: data.odometer,
    insuranceValidity: parseDdMmYyyy(data.insuranceValidity),
    pollutionValidity: data.pollutionValidity
      ? parseDdMmYyyy(data.pollutionValidity)
      : null,
    fcValidity: data.fcValidity ? parseDdMmYyyy(data.fcValidity) : null,
    basePermitValidity: data.basePermitValidity
      ? parseDdMmYyyy(data.basePermitValidity)
      : null,
    homeTaxValidity: data.homeTaxValidity
      ? parseDdMmYyyy(data.homeTaxValidity)
      : null,
    aitpValidity: data.aitpValidity ? parseDdMmYyyy(data.aitpValidity) : null,
    aitpAuthorizationValidity: data.aitpAuthorizationValidity
      ? parseDdMmYyyy(data.aitpAuthorizationValidity)
      : null,
    serviceOutDate: data.serviceOutDate ? parseDdMmYyyy(data.serviceOutDate) : null,
    remarks: data.remarks ?? null,
    lastMaintenanceDate: data.lastMaintenanceDate
      ? parseDdMmYyyy(data.lastMaintenanceDate)
      : null,
  };
}

function buildBusUpdateData(
  data: z.infer<typeof updateBusSchema>,
): Prisma.BusUpdateInput {
  const updateData: Prisma.BusUpdateInput = {};

  if (data.busNumber !== undefined) {
    updateData.busNumber = normalizeBusNumber(data.busNumber);
  }
  if (data.engineNumber !== undefined) updateData.engineNumber = data.engineNumber;
  if (data.chassisNumber !== undefined) updateData.chassisNumber = data.chassisNumber;
  if (data.purchaseDate !== undefined) {
    updateData.purchaseDate = data.purchaseDate ? parseDdMmYyyy(data.purchaseDate) : null;
  }
  if (data.odometer !== undefined) updateData.odometer = data.odometer;
  if (data.insuranceValidity !== undefined) {
    updateData.insuranceValidity = parseDdMmYyyy(data.insuranceValidity);
  }
  if (data.pollutionValidity !== undefined) {
    updateData.pollutionValidity = data.pollutionValidity
      ? parseDdMmYyyy(data.pollutionValidity)
      : null;
  }
  if (data.fcValidity !== undefined) {
    updateData.fcValidity = data.fcValidity ? parseDdMmYyyy(data.fcValidity) : null;
  }
  if (data.basePermitValidity !== undefined) {
    updateData.basePermitValidity = data.basePermitValidity
      ? parseDdMmYyyy(data.basePermitValidity)
      : null;
  }
  if (data.homeTaxValidity !== undefined) {
    updateData.homeTaxValidity = data.homeTaxValidity
      ? parseDdMmYyyy(data.homeTaxValidity)
      : null;
  }
  if (data.aitpValidity !== undefined) {
    updateData.aitpValidity = data.aitpValidity
      ? parseDdMmYyyy(data.aitpValidity)
      : null;
  }
  if (data.aitpAuthorizationValidity !== undefined) {
    updateData.aitpAuthorizationValidity = data.aitpAuthorizationValidity
      ? parseDdMmYyyy(data.aitpAuthorizationValidity)
      : null;
  }
  if (data.serviceOutDate !== undefined) {
    updateData.serviceOutDate = data.serviceOutDate
      ? parseDdMmYyyy(data.serviceOutDate)
      : null;
  }
  if (data.remarks !== undefined) updateData.remarks = data.remarks ?? null;
  if (data.lastMaintenanceDate !== undefined) {
    updateData.lastMaintenanceDate = data.lastMaintenanceDate
      ? parseDdMmYyyy(data.lastMaintenanceDate)
      : null;
  }

  return updateData;
}

const busesRouter = Router();

busesRouter.use(requireAuth);

busesRouter.get(
  "/buses",
  asyncHandler(async (req, res) => {
    const parsedQuery = paginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid query params", { issues: parsedQuery.error.issues });
    }

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.bus.findMany({
        orderBy: { busNumber: "asc" },
        skip,
        take: limit,
        select: busSelect,
      }),
      prisma.bus.count(),
    ]);

    res.status(200).json({
      success: true,
      data: { items: items.map(serializeBus) },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

busesRouter.get(
  "/buses/bus-numbers",
  asyncHandler(async (_req, res) => {
    const buses = await prisma.bus.findMany({
      orderBy: { busNumber: "asc" },
      select: { busNumber: true },
    });

    res.status(200).json({
      success: true,
      data: buses.map((bus) => bus.busNumber),
    });
  }),
);

busesRouter.get(
  "/buses/:busId",
  asyncHandler(async (req, res) => {
    const busId = req.params.busId;
    if (!busId || Array.isArray(busId)) {
      throw badRequest("Invalid bus id");
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      select: busSelect,
    });
    if (!bus) {
      throw notFound("Bus not found");
    }

    res.status(200).json({ success: true, data: serializeBus(bus) });
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
        data: buildBusWriteData(parsedBody.data),
        select: busSelect,
      });

      res.status(201).json({
        success: true,
        data: serializeBus(bus),
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
        data: buildBusUpdateData(parsedBody.data),
        select: busSelect,
      });

      res.status(200).json({
        success: true,
        data: serializeBus(bus),
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

busesRouter.delete(
  "/buses/:busId",
  requireFeature("manage_buses"),
  asyncHandler(async (req, res) => {
    const busId = req.params.busId;
    if (!busId || Array.isArray(busId)) {
      throw badRequest("Invalid bus id");
    }

    const existingBus = await prisma.bus.findUnique({
      where: { id: busId },
      select: { id: true },
    });

    if (!existingBus) {
      throw notFound("Bus not found");
    }

    try {
      await prisma.bus.delete({ where: { id: busId } });
      res.status(200).json({ success: true, data: { id: busId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw conflict("Bus cannot be deleted because it is referenced by tickets");
      }
      throw error;
    }
  }),
);

export { busesRouter };
