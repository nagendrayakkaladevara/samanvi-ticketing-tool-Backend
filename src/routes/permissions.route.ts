import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, notFound } from "../core/errors/http-errors";
import { buildPermissionTree } from "../lib/permission-catalog";
import { prisma } from "../lib/prisma";
import {
  getRoleDisplayPermissions,
  roleDisplayPermissionSelect,
} from "../lib/permissions";
import { requireAuth, requirePermission } from "../middleware/auth";

const permissionsRouter = Router();

permissionsRouter.use(requireAuth);

permissionsRouter.get(
  "/permissions",
  requirePermission({ module: "users", submodule: "", action: "view" }),
  asyncHandler(async (_req, res) => {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    });

    res.status(200).json({
      success: true,
      data: {
        items: permissions,
        tree: buildPermissionTree(permissions),
      },
    });
  }),
);

permissionsRouter.get(
  "/permissions/me",
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
        tree: buildPermissionTree(
          permissions.map((permission) => ({
            id: permission.id,
            module: permission.module,
            submodule: permission.submodule,
            action: permission.action,
            label: permission.label,
            sortOrder: 0,
          })),
        ),
      },
    });
  }),
);

export { permissionsRouter };

const rolePermissionsUpdateSchema = z.object({
  permissionIds: z.array(z.string().trim().min(1)),
});

const rolesRouter = Router();

rolesRouter.use(requireAuth);

rolesRouter.get(
  "/roles",
  requirePermission({ module: "users", submodule: "", action: "view" }),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: { label: "asc" },
      select: {
        id: true,
        code: true,
        label: true,
        rolePermissions: {
          select: {
            permission: {
              select: roleDisplayPermissionSelect,
            },
          },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        items: roles.map((role) => ({
          id: role.id,
          code: role.code,
          label: role.label,
          userCount: role._count.users,
          permissions: getRoleDisplayPermissions(role.rolePermissions),
        })),
      },
    });
  }),
);

rolesRouter.get(
  "/roles/:roleId",
  requirePermission({ module: "users", submodule: "", action: "view" }),
  asyncHandler(async (req, res) => {
    const roleId = req.params.roleId;
    if (!roleId || Array.isArray(roleId)) {
      throw badRequest("Invalid role id");
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        code: true,
        label: true,
        rolePermissions: {
          select: {
            permission: {
              select: roleDisplayPermissionSelect,
            },
          },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) {
      throw notFound("Role not found");
    }

    res.status(200).json({
      success: true,
      data: {
        id: role.id,
        code: role.code,
        label: role.label,
        userCount: role._count.users,
        permissions: getRoleDisplayPermissions(role.rolePermissions),
      },
    });
  }),
);

rolesRouter.put(
  "/roles/:roleId/permissions",
  requirePermission({
    module: "users",
    submodule: "",
    action: "manage_permissions",
  }),
  asyncHandler(async (req, res) => {
    const roleId = req.params.roleId;
    if (!roleId || Array.isArray(roleId)) {
      throw badRequest("Invalid role id");
    }

    const parsedBody = rolePermissionsUpdateSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid role permissions payload", {
        issues: parsedBody.error.issues,
      });
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, code: true },
    });

    if (!role) {
      throw notFound("Role not found");
    }

    const permissionCount = await prisma.permission.count({
      where: { id: { in: parsedBody.data.permissionIds } },
    });
    if (permissionCount !== parsedBody.data.permissionIds.length) {
      throw badRequest("One or more permissionIds are invalid");
    }

    const { syncRolePermissions } = await import("../lib/permissions");
    await syncRolePermissions(roleId, parsedBody.data.permissionIds);

    const updatedRole = await prisma.role.findUniqueOrThrow({
      where: { id: roleId },
      select: {
        id: true,
        code: true,
        label: true,
        rolePermissions: {
          select: {
            permission: {
              select: roleDisplayPermissionSelect,
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        id: updatedRole.id,
        code: updatedRole.code,
        label: updatedRole.label,
        permissions: getRoleDisplayPermissions(updatedRole.rolePermissions),
      },
    });
  }),
);

export { rolesRouter };
