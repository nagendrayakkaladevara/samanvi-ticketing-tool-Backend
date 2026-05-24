import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { decimalAmountSchema, paginationMeta, paginationQuerySchema } from "../lib/master";
import { requireAuth, requireFeature } from "../middleware/auth";

const serviceNumberSelect = {
  id: true,
  serviceNo: true,
  from: true,
  to: true,
  via: true,
  parkingAmount: true,
  driverOneBeta: true,
  driverTwoBeta: true,
  helperBeta: true,
  conductorBeta: true,
  distance: true,
  optDriver: true,
  optHelper: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  serviceFor: {
    select: { id: true, serviceFor: true },
  },
} satisfies Prisma.ServiceNumberSelect;

const serviceNumberFieldsSchema = z.object({
  serviceForId: z.string().trim().min(1),
  serviceNo: z.string().trim().min(1).max(50),
  from: z.string().trim().min(1).max(120),
  to: z.string().trim().min(1).max(120),
  via: z.string().trim().min(1).max(120),
  parkingAmount: decimalAmountSchema,
  driverOneBeta: decimalAmountSchema,
  driverTwoBeta: decimalAmountSchema,
  helperBeta: decimalAmountSchema,
  conductorBeta: decimalAmountSchema,
  distance: decimalAmountSchema,
  optDriver: z.string().trim().min(1).max(120),
  optHelper: z.string().trim().min(1).max(120),
  remarks: z.string().trim().min(1).max(500),
});

const createServiceNumberSchema = serviceNumberFieldsSchema;

const updateServiceNumberSchema = serviceNumberFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const serviceNumbersRouter = Router();

serviceNumbersRouter.use(requireAuth);

async function resolveServiceForId(serviceForId: string): Promise<void> {
  const serviceFor = await prisma.serviceFor.findUnique({
    where: { id: serviceForId },
    select: { id: true },
  });
  if (!serviceFor) {
    throw notFound("Service for not found");
  }
}

serviceNumbersRouter.get(
  "/service-numbers",
  asyncHandler(async (req, res) => {
    const parsedQuery = paginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid query params", { issues: parsedQuery.error.issues });
    }

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.serviceNumber.findMany({
        orderBy: { serviceNo: "asc" },
        skip,
        take: limit,
        select: serviceNumberSelect,
      }),
      prisma.serviceNumber.count(),
    ]);

    res.status(200).json({
      success: true,
      data: { items },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

serviceNumbersRouter.post(
  "/service-numbers",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const parsedBody = createServiceNumberSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid service number payload", {
        issues: parsedBody.error.issues,
      });
    }

    await resolveServiceForId(parsedBody.data.serviceForId);

    try {
      const item = await prisma.serviceNumber.create({
        data: parsedBody.data,
        select: serviceNumberSelect,
      });

      res.status(201).json({ success: true, data: item });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Service number already exists");
      }
      throw error;
    }
  }),
);

serviceNumbersRouter.patch(
  "/service-numbers/:serviceNumberId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const serviceNumberId = req.params.serviceNumberId;
    if (!serviceNumberId || Array.isArray(serviceNumberId)) {
      throw badRequest("Invalid service number id");
    }

    const parsedBody = updateServiceNumberSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid service number payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.serviceNumber.findUnique({
      where: { id: serviceNumberId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Service number not found");
    }

    if (parsedBody.data.serviceForId) {
      await resolveServiceForId(parsedBody.data.serviceForId);
    }

    try {
      const item = await prisma.serviceNumber.update({
        where: { id: serviceNumberId },
        data: parsedBody.data,
        select: serviceNumberSelect,
      });

      res.status(200).json({ success: true, data: item });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Service number already exists");
      }
      throw error;
    }
  }),
);

serviceNumbersRouter.delete(
  "/service-numbers/:serviceNumberId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const serviceNumberId = req.params.serviceNumberId;
    if (!serviceNumberId || Array.isArray(serviceNumberId)) {
      throw badRequest("Invalid service number id");
    }

    const existing = await prisma.serviceNumber.findUnique({
      where: { id: serviceNumberId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Service number not found");
    }

    await prisma.serviceNumber.delete({ where: { id: serviceNumberId } });

    res.status(200).json({ success: true, data: { id: serviceNumberId } });
  }),
);

export { serviceNumbersRouter };
