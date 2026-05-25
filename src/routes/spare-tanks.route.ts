import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import {
  normalizeBusNumber,
  paginationMeta,
  paginationQuerySchema,
} from "../lib/master";
import { requireAuth, requireFeature } from "../middleware/auth";

const spareTankSelect = {
  id: true,
  busNumber: true,
  ownerName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SpareTankSelect;

const createSpareTankSchema = z.object({
  busNumber: z.string().trim().min(1).max(50),
  ownerName: z.string().trim().min(1).max(120),
});

const updateSpareTankSchema = z
  .object({
    busNumber: z.string().trim().min(1).max(50).optional(),
    ownerName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.busNumber !== undefined || value.ownerName !== undefined, {
    message: "At least one field (busNumber or ownerName) must be provided",
  });

const spareTanksRouter = Router();

spareTanksRouter.use(requireAuth);

spareTanksRouter.get(
  "/spare-tanks",
  asyncHandler(async (req, res) => {
    const parsedQuery = paginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid query params", { issues: parsedQuery.error.issues });
    }

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.spareTank.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: spareTankSelect,
      }),
      prisma.spareTank.count(),
    ]);

    res.status(200).json({
      success: true,
      data: { items },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

spareTanksRouter.post(
  "/spare-tanks",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const parsedBody = createSpareTankSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid spare tank payload", {
        issues: parsedBody.error.issues,
      });
    }

    const item = await prisma.spareTank.create({
      data: {
        busNumber: normalizeBusNumber(parsedBody.data.busNumber),
        ownerName: parsedBody.data.ownerName,
      },
      select: spareTankSelect,
    });

    res.status(201).json({ success: true, data: item });
  }),
);

spareTanksRouter.patch(
  "/spare-tanks/:spareTankId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const spareTankId = req.params.spareTankId;
    if (!spareTankId || Array.isArray(spareTankId)) {
      throw badRequest("Invalid spare tank id");
    }

    const parsedBody = updateSpareTankSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid spare tank payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.spareTank.findUnique({
      where: { id: spareTankId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Spare tank not found");
    }

    const item = await prisma.spareTank.update({
      where: { id: spareTankId },
      data: {
        ...(parsedBody.data.busNumber !== undefined
          ? { busNumber: normalizeBusNumber(parsedBody.data.busNumber) }
          : {}),
        ...(parsedBody.data.ownerName !== undefined
          ? { ownerName: parsedBody.data.ownerName }
          : {}),
      },
      select: spareTankSelect,
    });

    res.status(200).json({ success: true, data: item });
  }),
);

spareTanksRouter.delete(
  "/spare-tanks/:spareTankId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const spareTankId = req.params.spareTankId;
    if (!spareTankId || Array.isArray(spareTankId)) {
      throw badRequest("Invalid spare tank id");
    }

    const existing = await prisma.spareTank.findUnique({
      where: { id: spareTankId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Spare tank not found");
    }

    await prisma.spareTank.delete({ where: { id: spareTankId } });

    res.status(200).json({ success: true, data: { id: spareTankId } });
  }),
);

export { spareTanksRouter };
