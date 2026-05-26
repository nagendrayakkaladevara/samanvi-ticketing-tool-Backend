import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import {
  buildRepairCategoryTree,
  MAX_REPAIR_CATEGORY_DEPTH,
} from "../lib/garage";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const repairCategorySelect = {
  id: true,
  name: true,
  level: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RepairCategorySelect;

const createRepairCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().trim().min(1).optional(),
});

const updateRepairCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.name !== undefined, {
    message: "At least one field (name) must be provided",
  });

const repairCategoriesRouter = Router();

repairCategoriesRouter.use(requireAuth);

repairCategoriesRouter.get(
  "/masters/repair-categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.repairCategory.findMany({
      orderBy: [{ level: "asc" }, { name: "asc" }],
      select: repairCategorySelect,
    });

    res.status(200).json({
      success: true,
      data: {
        items: categories,
        tree: buildRepairCategoryTree(categories),
      },
    });
  }),
);

repairCategoriesRouter.post(
  "/masters/repair-categories",
  requireFeature("manage_garage_masters"),
  asyncHandler(async (req, res) => {
    const parsedBody = createRepairCategorySchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid repair category payload", {
        issues: parsedBody.error.issues,
      });
    }

    let level = 1;
    if (parsedBody.data.parentId) {
      const parent = await prisma.repairCategory.findUnique({
        where: { id: parsedBody.data.parentId },
        select: { id: true, level: true },
      });
      if (!parent) {
        throw notFound("Parent repair category not found");
      }
      level = parent.level + 1;
      if (level > MAX_REPAIR_CATEGORY_DEPTH) {
        throw badRequest(
          `Repair categories cannot exceed ${MAX_REPAIR_CATEGORY_DEPTH} levels`,
        );
      }
    } else {
      const duplicateRoot = await prisma.repairCategory.findFirst({
        where: {
          parentId: null,
          name: parsedBody.data.name,
        },
        select: { id: true },
      });
      if (duplicateRoot) {
        throw conflict("Repair category name already exists at this level");
      }
    }

    try {
      const category = await prisma.repairCategory.create({
        data: {
          name: parsedBody.data.name,
          parentId: parsedBody.data.parentId ?? null,
          level,
        },
        select: repairCategorySelect,
      });

      res.status(201).json({ success: true, data: category });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Repair category name already exists at this level");
      }
      throw error;
    }
  }),
);

repairCategoriesRouter.patch(
  "/masters/repair-categories/:categoryId",
  requireFeature("manage_garage_masters"),
  asyncHandler(async (req, res) => {
    const categoryId = req.params.categoryId;
    if (!categoryId || Array.isArray(categoryId)) {
      throw badRequest("Invalid repair category id");
    }

    const parsedBody = updateRepairCategorySchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid repair category payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.repairCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, parentId: true },
    });
    if (!existing) {
      throw notFound("Repair category not found");
    }

    try {
      const category = await prisma.repairCategory.update({
        where: { id: categoryId },
        data: parsedBody.data,
        select: repairCategorySelect,
      });

      res.status(200).json({ success: true, data: category });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Repair category name already exists at this level");
      }
      throw error;
    }
  }),
);

repairCategoriesRouter.delete(
  "/masters/repair-categories/:categoryId",
  requireFeature("manage_garage_masters"),
  asyncHandler(async (req, res) => {
    const categoryId = req.params.categoryId;
    if (!categoryId || Array.isArray(categoryId)) {
      throw badRequest("Invalid repair category id");
    }

    const existing = await prisma.repairCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Repair category not found");
    }

    const [childCount, jobCount] = await Promise.all([
      prisma.repairCategory.count({ where: { parentId: categoryId } }),
      prisma.repairJob.count({ where: { repairCategoryId: categoryId, deletedAt: null } }),
    ]);

    if (childCount > 0) {
      throw conflict("Cannot delete a repair category that has subcategories");
    }
    if (jobCount > 0) {
      throw conflict("Cannot delete a repair category referenced by repair jobs");
    }

    await prisma.repairCategory.delete({ where: { id: categoryId } });

    res.status(200).json({ success: true, data: { id: categoryId } });
  }),
);

export { repairCategoriesRouter };
