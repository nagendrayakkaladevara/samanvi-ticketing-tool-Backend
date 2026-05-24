import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const serviceForSelect = {
  id: true,
  serviceFor: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceForSelect;

const createServiceForSchema = z.object({
  serviceFor: z.string().trim().min(1).max(120),
});

const updateServiceForSchema = z
  .object({
    serviceFor: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.serviceFor !== undefined, {
    message: "At least one field (serviceFor) must be provided",
  });

const serviceForRouter = Router();

serviceForRouter.use(requireAuth);

serviceForRouter.get(
  "/service-for",
  asyncHandler(async (_req, res) => {
    const items = await prisma.serviceFor.findMany({
      orderBy: { serviceFor: "asc" },
      select: serviceForSelect,
    });

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.status(200).json({ success: true, data: { items } });
  }),
);

serviceForRouter.post(
  "/service-for",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const parsedBody = createServiceForSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid service for payload", {
        issues: parsedBody.error.issues,
      });
    }

    try {
      const item = await prisma.serviceFor.create({
        data: { serviceFor: parsedBody.data.serviceFor },
        select: serviceForSelect,
      });

      res.status(201).json({ success: true, data: item });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Service for already exists");
      }
      throw error;
    }
  }),
);

serviceForRouter.patch(
  "/service-for/:serviceForId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const serviceForId = req.params.serviceForId;
    if (!serviceForId || Array.isArray(serviceForId)) {
      throw badRequest("Invalid service for id");
    }

    const parsedBody = updateServiceForSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid service for payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.serviceFor.findUnique({
      where: { id: serviceForId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Service for not found");
    }

    try {
      const item = await prisma.serviceFor.update({
        where: { id: serviceForId },
        data: parsedBody.data,
        select: serviceForSelect,
      });

      res.status(200).json({ success: true, data: item });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Service for already exists");
      }
      throw error;
    }
  }),
);

serviceForRouter.delete(
  "/service-for/:serviceForId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const serviceForId = req.params.serviceForId;
    if (!serviceForId || Array.isArray(serviceForId)) {
      throw badRequest("Invalid service for id");
    }

    const existing = await prisma.serviceFor.findUnique({
      where: { id: serviceForId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Service for not found");
    }

    await prisma.serviceFor.delete({ where: { id: serviceForId } });

    res.status(200).json({ success: true, data: { id: serviceForId } });
  }),
);

export { serviceForRouter };
