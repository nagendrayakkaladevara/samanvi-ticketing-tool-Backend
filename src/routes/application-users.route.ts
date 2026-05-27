import { Prisma, RoleCode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "../auth/password";
import { MANAGED_USER_TYPE_CODES } from "../auth/roles";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { toUserUniqueConflictError } from "../lib/prisma-user-unique";
import { requireAuth, requirePermission } from "../middleware/auth";
import { syncUserPermissions } from "../lib/permissions";

const usernameSchema = z.string().trim().min(3).max(50);

const mobileNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Mobile number must be exactly 10 digits");

const managedRoleCodeSchema = z.enum(MANAGED_USER_TYPE_CODES);

const permissionIdsSchema = z.array(z.string().trim().min(1)).default([]);

const createApplicationUserSchema = z.object({
  username: usernameSchema,
  fullName: z.string().trim().min(1).max(100),
  password: z.string().min(6).max(128),
  mobileNumber: mobileNumberSchema,
  userType: managedRoleCodeSchema,
  email: z.string().trim().email().max(150).optional(),
  isActive: z.boolean().optional(),
  permissionIds: permissionIdsSchema.optional(),
});

const updateApplicationUserSchema = z
  .object({
    username: usernameSchema.optional(),
    fullName: z.string().trim().min(1).max(100).optional(),
    password: z.string().min(6).max(128).optional(),
    mobileNumber: mobileNumberSchema.optional(),
    userType: managedRoleCodeSchema.optional(),
    email: z.string().trim().email().max(150).nullable().optional(),
    isActive: z.boolean().optional(),
    permissionIds: permissionIdsSchema.optional(),
  })
  .refine(
    (value) =>
      value.username !== undefined ||
      value.fullName !== undefined ||
      value.password !== undefined ||
      value.mobileNumber !== undefined ||
      value.userType !== undefined ||
      value.email !== undefined ||
      value.isActive !== undefined ||
      value.permissionIds !== undefined,
    { message: "At least one updatable field must be provided" },
  );

const applicationUserListQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
  userType: managedRoleCodeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const applicationUserSelect = {
  id: true,
  username: true,
  displayName: true,
  mobileNumber: true,
  email: true,
  isActive: true,
  role: {
    select: {
      id: true,
      code: true,
      label: true,
    },
  },
  userPermissions: {
    select: {
      permission: {
        select: {
          id: true,
          module: true,
          submodule: true,
          action: true,
          label: true,
        },
      },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

function serializeApplicationUser(
  user: Prisma.UserGetPayload<{ select: typeof applicationUserSelect }>,
) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.displayName,
    mobileNumber: user.mobileNumber,
    email: user.email,
    isActive: user.isActive,
    userType: user.role,
    permissions: user.userPermissions.map((row) => row.permission),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const applicationUsersRouter = Router();

applicationUsersRouter.use(requireAuth);

applicationUsersRouter.get(
  "/application-users/me/permissions",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authentication required");
    }

    const { getUserEffectivePermissions } = await import("../lib/permissions");
    const permissions = await getUserEffectivePermissions(
      req.user.sub,
      req.user.roleCode,
    );

    res.status(200).json({
      success: true,
      data: {
        permissions,
      },
    });
  }),
);

applicationUsersRouter.get(
  "/application-users",
  requirePermission({ module: "users", submodule: "", action: "view" }),
  asyncHandler(async (req, res) => {
    const parsedQuery = applicationUserListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid application users query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const { includeInactive, userType, page, limit } = parsedQuery.data;
    const where: Prisma.UserWhereInput = {
      role: {
        code: userType
          ? userType
          : { in: [...MANAGED_USER_TYPE_CODES] },
      },
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ role: { code: "asc" } }, { displayName: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: applicationUserSelect,
      }),
    ]);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");

    res.status(200).json({
      success: true,
      data: {
        items: users.map(serializeApplicationUser),
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  }),
);

applicationUsersRouter.get(
  "/application-users/:userId",
  requirePermission({ module: "users", submodule: "", action: "view" }),
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    if (!userId || Array.isArray(userId)) {
      throw badRequest("Invalid user id");
    }

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: { code: { in: [...MANAGED_USER_TYPE_CODES] } },
      },
      select: applicationUserSelect,
    });

    if (!user) {
      throw notFound("Application user not found");
    }

    res.status(200).json({
      success: true,
      data: serializeApplicationUser(user),
    });
  }),
);

applicationUsersRouter.post(
  "/application-users",
  requirePermission({ module: "users", submodule: "", action: "create" }),
  asyncHandler(async (req, res) => {
    const parsedBody = createApplicationUserSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid application user payload", {
        issues: parsedBody.error.issues,
      });
    }

    const role = await prisma.role.findUnique({
      where: { code: parsedBody.data.userType },
      select: { id: true },
    });

    if (!role) {
      throw badRequest(`User type ${parsedBody.data.userType} is not configured`);
    }

    if (parsedBody.data.permissionIds && parsedBody.data.permissionIds.length > 0) {
      const permissionCount = await prisma.permission.count({
        where: { id: { in: parsedBody.data.permissionIds } },
      });
      if (permissionCount !== parsedBody.data.permissionIds.length) {
        throw badRequest("One or more permissionIds are invalid");
      }
    }

    try {
      const user = await prisma.user.create({
        data: {
          username: parsedBody.data.username,
          mobileNumber: parsedBody.data.mobileNumber,
          passwordHash: await hashPassword(parsedBody.data.password),
          displayName: parsedBody.data.fullName,
          email: parsedBody.data.email,
          isActive: parsedBody.data.isActive ?? true,
          roleId: role.id,
        },
        select: applicationUserSelect,
      });

      if (parsedBody.data.permissionIds && parsedBody.data.permissionIds.length > 0) {
        await syncUserPermissions(user.id, parsedBody.data.permissionIds);
      }

      const createdUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: applicationUserSelect,
      });

      res.status(201).json({
        success: true,
        data: serializeApplicationUser(createdUser),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const formattedError = toUserUniqueConflictError(error);
        if (formattedError) {
          throw formattedError;
        }
      }
      throw error;
    }
  }),
);

applicationUsersRouter.patch(
  "/application-users/:userId",
  requirePermission({ module: "users", submodule: "", action: "edit" }),
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    if (!userId || Array.isArray(userId)) {
      throw badRequest("Invalid user id");
    }

    const parsedBody = updateApplicationUserSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid application user payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        role: { code: { in: [...MANAGED_USER_TYPE_CODES] } },
      },
      select: { id: true },
    });

    if (!existingUser) {
      throw notFound("Application user not found");
    }

    let roleId: string | undefined;
    if (parsedBody.data.userType) {
      const role = await prisma.role.findUnique({
        where: { code: parsedBody.data.userType },
        select: { id: true },
      });
      if (!role) {
        throw badRequest(`User type ${parsedBody.data.userType} is not configured`);
      }
      roleId = role.id;
    }

    if (parsedBody.data.permissionIds) {
      const permissionCount = await prisma.permission.count({
        where: { id: { in: parsedBody.data.permissionIds } },
      });
      if (permissionCount !== parsedBody.data.permissionIds.length) {
        throw badRequest("One or more permissionIds are invalid");
      }
    }

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(parsedBody.data.fullName !== undefined
            ? { displayName: parsedBody.data.fullName }
            : {}),
          ...(parsedBody.data.password !== undefined
            ? { passwordHash: await hashPassword(parsedBody.data.password) }
            : {}),
          ...(parsedBody.data.username !== undefined
            ? { username: parsedBody.data.username }
            : {}),
          ...(parsedBody.data.mobileNumber !== undefined
            ? { mobileNumber: parsedBody.data.mobileNumber }
            : {}),
          ...(parsedBody.data.email !== undefined
            ? { email: parsedBody.data.email }
            : {}),
          ...(parsedBody.data.isActive !== undefined
            ? { isActive: parsedBody.data.isActive }
            : {}),
          ...(roleId ? { roleId } : {}),
        },
        select: applicationUserSelect,
      });

      if (parsedBody.data.permissionIds !== undefined) {
        await syncUserPermissions(userId, parsedBody.data.permissionIds);
      }

      const updatedUser = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: applicationUserSelect,
      });

      res.status(200).json({
        success: true,
        data: serializeApplicationUser(updatedUser),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const formattedError = toUserUniqueConflictError(error);
        if (formattedError) {
          throw formattedError;
        }
      }
      throw error;
    }
  }),
);

applicationUsersRouter.put(
  "/application-users/:userId/permissions",
  requirePermission({
    module: "users",
    submodule: "",
    action: "manage_permissions",
  }),
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    if (!userId || Array.isArray(userId)) {
      throw badRequest("Invalid user id");
    }

    const parsedBody = z
      .object({ permissionIds: permissionIdsSchema })
      .safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid permissions payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        role: { code: { in: [...MANAGED_USER_TYPE_CODES, RoleCode.admin] } },
      },
      select: { id: true },
    });

    if (!existingUser) {
      throw notFound("Application user not found");
    }

    const permissionCount = await prisma.permission.count({
      where: { id: { in: parsedBody.data.permissionIds } },
    });
    if (permissionCount !== parsedBody.data.permissionIds.length) {
      throw badRequest("One or more permissionIds are invalid");
    }

    await syncUserPermissions(userId, parsedBody.data.permissionIds);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: applicationUserSelect,
    });

    res.status(200).json({
      success: true,
      data: serializeApplicationUser(updatedUser),
    });
  }),
);

applicationUsersRouter.delete(
  "/application-users/:userId",
  requirePermission({ module: "users", submodule: "", action: "delete" }),
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    if (!userId || Array.isArray(userId)) {
      throw badRequest("Invalid user id");
    }

    if (req.user?.sub === userId) {
      throw conflict("You cannot delete your own account");
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        role: { code: { in: [...MANAGED_USER_TYPE_CODES] } },
      },
      select: { id: true },
    });

    if (!existingUser) {
      throw notFound("Application user not found");
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

export { applicationUsersRouter };
