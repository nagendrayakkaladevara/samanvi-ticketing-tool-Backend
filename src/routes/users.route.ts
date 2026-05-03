import { Prisma, RoleCode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "../auth/password";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const managedRoleCodeSchema = z.enum([RoleCode.supervisor, RoleCode.worker]);

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(128),
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(150).optional(),
  roleCode: managedRoleCodeSchema,
  isActive: z.boolean().optional(),
});

const updateUserSchema = z
  .object({
    username: z.string().trim().min(3).max(50).optional(),
    password: z.string().min(6).max(128).optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(150).nullable().optional(),
    roleCode: managedRoleCodeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.username !== undefined ||
      value.password !== undefined ||
      value.displayName !== undefined ||
      value.email !== undefined ||
      value.roleCode !== undefined ||
      value.isActive !== undefined,
    { message: "At least one updatable field must be provided" },
  );

const userListQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
  roleCode: managedRoleCodeSchema.optional(),
});

function toConflictError(error: Prisma.PrismaClientKnownRequestError) {
  if (error.code !== "P2002") {
    return null;
  }

  const target = Array.isArray(error.meta?.["target"])
    ? (error.meta["target"] as string[])
    : [];

  if (target.includes("username")) {
    return conflict("Username already exists");
  }
  if (target.includes("email")) {
    return conflict("Email already exists");
  }
  return conflict("User with provided unique field already exists");
}

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  isActive: true,
  role: {
    select: {
      code: true,
      label: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const usersRouter = Router();

/** Auth only here — `manage_users` must be per-route or it runs for unrelated paths (e.g. `/tickets/my`). */
usersRouter.use(requireAuth);

usersRouter.get(
  "/users",
  requireFeature("manage_users"),
  asyncHandler(async (req, res) => {
    const parsedQuery = userListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid users query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const users = await prisma.user.findMany({
      where: {
        role: {
          code: parsedQuery.data.roleCode
            ? parsedQuery.data.roleCode
            : { in: [RoleCode.supervisor, RoleCode.worker] },
        },
        ...(parsedQuery.data.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ role: { code: "asc" } }, { displayName: "asc" }],
      select: userSelect,
    });

    res.status(200).json({
      success: true,
      data: {
        items: users,
      },
    });
  }),
);

usersRouter.get(
  "/users/:userId",
  requireFeature("manage_users"),
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    if (!userId || Array.isArray(userId)) {
      throw badRequest("Invalid user id");
    }

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: {
          code: { in: [RoleCode.supervisor, RoleCode.worker] },
        },
      },
      select: userSelect,
    });

    if (!user) {
      throw notFound("User not found");
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  }),
);

usersRouter.post(
  "/users",
  requireFeature("manage_users"),
  asyncHandler(async (req, res) => {
    const parsedBody = createUserSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid user payload", {
        issues: parsedBody.error.issues,
      });
    }

    const role = await prisma.role.findUnique({
      where: { code: parsedBody.data.roleCode },
      select: { id: true },
    });

    if (!role) {
      throw badRequest(`Role ${parsedBody.data.roleCode} is not configured`);
    }

    try {
      const user = await prisma.user.create({
        data: {
          username: parsedBody.data.username,
          passwordHash: await hashPassword(parsedBody.data.password),
          displayName: parsedBody.data.displayName,
          email: parsedBody.data.email,
          isActive: parsedBody.data.isActive ?? true,
          roleId: role.id,
        },
        select: userSelect,
      });

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const formattedError = toConflictError(error);
        if (formattedError) {
          throw formattedError;
        }
      }
      throw error;
    }
  }),
);

usersRouter.patch(
  "/users/:userId",
  requireFeature("manage_users"),
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    if (!userId || Array.isArray(userId)) {
      throw badRequest("Invalid user id");
    }

    const parsedBody = updateUserSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid user payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        role: { code: { in: [RoleCode.supervisor, RoleCode.worker] } },
      },
      select: { id: true },
    });

    if (!existingUser) {
      throw notFound("User not found");
    }

    let roleId: string | undefined;
    if (parsedBody.data.roleCode) {
      const role = await prisma.role.findUnique({
        where: { code: parsedBody.data.roleCode },
        select: { id: true },
      });
      if (!role) {
        throw badRequest(`Role ${parsedBody.data.roleCode} is not configured`);
      }
      roleId = role.id;
    }

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(parsedBody.data.username !== undefined
            ? { username: parsedBody.data.username }
            : {}),
          ...(parsedBody.data.password !== undefined
            ? { passwordHash: await hashPassword(parsedBody.data.password) }
            : {}),
          ...(parsedBody.data.displayName !== undefined
            ? { displayName: parsedBody.data.displayName }
            : {}),
          ...(parsedBody.data.email !== undefined
            ? { email: parsedBody.data.email }
            : {}),
          ...(parsedBody.data.isActive !== undefined
            ? { isActive: parsedBody.data.isActive }
            : {}),
          ...(roleId ? { roleId } : {}),
        },
        select: userSelect,
      });

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const formattedError = toConflictError(error);
        if (formattedError) {
          throw formattedError;
        }
      }
      throw error;
    }
  }),
);

usersRouter.delete(
  "/users/:userId",
  requireFeature("manage_users"),
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    if (!userId || Array.isArray(userId)) {
      throw badRequest("Invalid user id");
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        role: { code: { in: [RoleCode.supervisor, RoleCode.worker] } },
      },
      select: { id: true },
    });

    if (!existingUser) {
      throw notFound("User not found");
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    res.status(200).json({
      success: true,
      data: {
        id: userId,
      },
    });
  }),
);

export { usersRouter };
