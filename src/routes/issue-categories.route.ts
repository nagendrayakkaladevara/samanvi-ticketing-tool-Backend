import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const createIssueCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const updateIssueCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: "At least one field (name or isActive) must be provided",
  });

const issueCategoriesRouter = Router();

issueCategoriesRouter.use(requireAuth);

issueCategoriesRouter.get(
  "/issue-categories",
  asyncHandler(async (req, res) => {
    const includeInactive = req.query["includeInactive"] === "true";

    const categories = await prisma.issueCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: "asc" },
    });

    res.status(200).json({
      success: true,
      data: {
        items: categories,
      },
    });
  }),
);

issueCategoriesRouter.post(
  "/issue-categories",
  requireFeature("manage_categories"),
  asyncHandler(async (req, res) => {
    const parsedBody = createIssueCategorySchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid issue category payload", {
        issues: parsedBody.error.issues,
      });
    }

    try {
      const category = await prisma.issueCategory.create({
        data: {
          name: parsedBody.data.name,
        },
      });

      res.status(201).json({
        success: true,
        data: category,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Issue category name already exists");
      }
      throw error;
    }
  }),
);

issueCategoriesRouter.patch(
  "/issue-categories/:categoryId",
  requireFeature("manage_categories"),
  asyncHandler(async (req, res) => {
    const categoryId = req.params.categoryId;
    if (!categoryId || Array.isArray(categoryId)) {
      throw badRequest("Invalid issue category id");
    }

    const parsedBody = updateIssueCategorySchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid issue category payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existingCategory = await prisma.issueCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!existingCategory) {
      throw notFound("Issue category not found");
    }

    try {
      const category = await prisma.issueCategory.update({
        where: { id: categoryId },
        data: parsedBody.data,
      });

      res.status(200).json({
        success: true,
        data: category,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Issue category name already exists");
      }
      throw error;
    }
  }),
);

export { issueCategoriesRouter };
