import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { decimalAmountSchema, paginationMeta, paginationQuerySchema } from "../lib/master";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const repairPartSelect = {
  id: true,
  partName: true,
  price: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RepairPartSelect;

const createRepairPartSchema = z.object({
  partName: z.string().trim().min(1).max(120),
  price: decimalAmountSchema,
  description: z.string().trim().min(1).max(500).optional(),
});

const updateRepairPartSchema = z
  .object({
    partName: z.string().trim().min(1).max(120).optional(),
    price: decimalAmountSchema.optional(),
    description: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .refine(
    (value) =>
      value.partName !== undefined ||
      value.price !== undefined ||
      value.description !== undefined,
    { message: "At least one field must be provided" },
  );

function serializeRepairPart(
  part: Prisma.RepairPartGetPayload<{ select: typeof repairPartSelect }>,
) {
  return {
    ...part,
    price: part.price.toString(),
  };
}

const repairPartsRouter = Router();

repairPartsRouter.use(requireAuth);

repairPartsRouter.get(
  "/masters/repair-parts",
  asyncHandler(async (req, res) => {
    const parsedQuery = paginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid pagination query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.repairPart.findMany({
        skip,
        take: limit,
        orderBy: { partName: "asc" },
        select: repairPartSelect,
      }),
      prisma.repairPart.count(),
    ]);

    res.status(200).json({
      success: true,
      data: { items: items.map(serializeRepairPart) },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

repairPartsRouter.get(
  "/masters/repair-parts/:partId",
  asyncHandler(async (req, res) => {
    const partId = req.params.partId;
    if (!partId || Array.isArray(partId)) {
      throw badRequest("Invalid repair part id");
    }

    const part = await prisma.repairPart.findUnique({
      where: { id: partId },
      select: repairPartSelect,
    });
    if (!part) {
      throw notFound("Repair part not found");
    }

    res.status(200).json({ success: true, data: serializeRepairPart(part) });
  }),
);

repairPartsRouter.post(
  "/masters/repair-parts",
  requireFeature("manage_garage_masters"),
  asyncHandler(async (req, res) => {
    const parsedBody = createRepairPartSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid repair part payload", {
        issues: parsedBody.error.issues,
      });
    }

    try {
      const part = await prisma.repairPart.create({
        data: parsedBody.data,
        select: repairPartSelect,
      });

      res.status(201).json({ success: true, data: serializeRepairPart(part) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Repair part name already exists");
      }
      throw error;
    }
  }),
);

repairPartsRouter.patch(
  "/masters/repair-parts/:partId",
  requireFeature("manage_garage_masters"),
  asyncHandler(async (req, res) => {
    const partId = req.params.partId;
    if (!partId || Array.isArray(partId)) {
      throw badRequest("Invalid repair part id");
    }

    const parsedBody = updateRepairPartSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid repair part payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.repairPart.findUnique({
      where: { id: partId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Repair part not found");
    }

    try {
      const part = await prisma.repairPart.update({
        where: { id: partId },
        data: parsedBody.data,
        select: repairPartSelect,
      });

      res.status(200).json({ success: true, data: serializeRepairPart(part) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Repair part name already exists");
      }
      throw error;
    }
  }),
);

repairPartsRouter.delete(
  "/masters/repair-parts/:partId",
  requireFeature("manage_garage_masters"),
  asyncHandler(async (req, res) => {
    const partId = req.params.partId;
    if (!partId || Array.isArray(partId)) {
      throw badRequest("Invalid repair part id");
    }

    const existing = await prisma.repairPart.findUnique({
      where: { id: partId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Repair part not found");
    }

    const jobPartCount = await prisma.repairJobPart.count({
      where: { repairPartId: partId },
    });
    if (jobPartCount > 0) {
      throw conflict("Cannot delete a repair part used on repair jobs");
    }

    await prisma.repairPart.delete({ where: { id: partId } });

    res.status(200).json({ success: true, data: { id: partId } });
  }),
);

export { repairPartsRouter };
