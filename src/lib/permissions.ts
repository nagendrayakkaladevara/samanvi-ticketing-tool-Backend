import type { RoleCode as PrismaRoleCode } from "@prisma/client";
import {
  canAccessFeature as canAccessLegacyFeature,
  type Feature,
  type RoleCode,
} from "../auth/roles";
import { prisma } from "./prisma";
import {
  LEGACY_FEATURE_PERMISSIONS,
  permissionKey,
  USE_ROLE_PERMISSION_TEMPLATES,
  type PermissionKey,
} from "./permission-catalog";

export interface EffectivePermission {
  id: string;
  module: string;
  submodule: string;
  action: string;
  label: string;
  key: string;
  source: "role" | "user";
}

export function isAdminRole(roleCode: string): boolean {
  return roleCode === "admin";
}

const permissionSelect = {
  id: true,
  module: true,
  submodule: true,
  action: true,
  label: true,
  sortOrder: true,
} as const;

export const roleDisplayPermissionSelect = permissionSelect;

export async function getAllPermissions() {
  return prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    select: permissionSelect,
  });
}

export async function getRoleDisplayPermissions(
  roleCode: string,
  rolePermissions: Array<{
    permission: {
      id: string;
      module: string;
      submodule: string;
      action: string;
      label: string;
      sortOrder: number;
    };
  }>,
) {
  if (isAdminRole(roleCode)) {
    return getAllPermissions();
  }

  return rolePermissions.map((row) => row.permission);
}

function uniquePermissionKeys(keys: PermissionKey[]): PermissionKey[] {
  const seen = new Set<string>();
  const result: PermissionKey[] = [];
  for (const key of keys) {
    const serialized = permissionKey(key);
    if (seen.has(serialized)) {
      continue;
    }
    seen.add(serialized);
    result.push(key);
  }
  return result;
}

export async function getUserEffectivePermissions(
  userId: string,
  roleCode: PrismaRoleCode | RoleCode,
): Promise<EffectivePermission[]> {
  if (isAdminRole(roleCode)) {
    const all = await getAllPermissions();
    return all.map((permission) => ({
      id: permission.id,
      module: permission.module,
      submodule: permission.submodule,
      action: permission.action,
      label: permission.label,
      key: permissionKey(permission),
      source: "role" as const,
    }));
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: {
        select: {
          rolePermissions: {
            select: {
              permission: true,
            },
          },
        },
      },
      userPermissions: {
        select: {
          permission: true,
        },
      },
    },
  });

  if (!user) {
    return [];
  }

  const merged = new Map<string, EffectivePermission>();

  if (USE_ROLE_PERMISSION_TEMPLATES) {
    for (const row of user.role.rolePermissions) {
      const permission = row.permission;
      merged.set(permissionKey(permission), {
        id: permission.id,
        module: permission.module,
        submodule: permission.submodule,
        action: permission.action,
        label: permission.label,
        key: permissionKey(permission),
        source: "role",
      });
    }
  }

  for (const row of user.userPermissions) {
    const permission = row.permission;
    merged.set(permissionKey(permission), {
      id: permission.id,
      module: permission.module,
      submodule: permission.submodule,
      action: permission.action,
      label: permission.label,
      key: permissionKey(permission),
      source: "user",
    });
  }

  return [...merged.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}

export async function userHasPermission(
  userId: string,
  roleCode: PrismaRoleCode | RoleCode,
  required: PermissionKey,
): Promise<boolean> {
  if (isAdminRole(roleCode)) {
    return true;
  }

  const permissions = await getUserEffectivePermissions(userId, roleCode);
  const requiredKey = permissionKey(required);
  return permissions.some((permission) => permission.key === requiredKey);
}

export async function userHasAnyPermission(
  userId: string,
  roleCode: PrismaRoleCode | RoleCode,
  requiredKeys: PermissionKey[],
): Promise<boolean> {
  if (isAdminRole(roleCode)) {
    return true;
  }

  if (requiredKeys.length === 0) {
    return true;
  }

  const permissions = await getUserEffectivePermissions(userId, roleCode);
  const granted = new Set(permissions.map((permission) => permission.key));
  return requiredKeys.some((key) => granted.has(permissionKey(key)));
}

export async function userHasFeatureAccess(
  userId: string,
  roleCode: PrismaRoleCode | RoleCode,
  feature: Feature,
): Promise<boolean> {
  if (isAdminRole(roleCode)) {
    return true;
  }

  const requiredKeys = LEGACY_FEATURE_PERMISSIONS[feature];
  const hasDbPermissions = await userHasAnyPermission(
    userId,
    roleCode,
    requiredKeys,
  );
  if (hasDbPermissions) {
    return true;
  }

  // Fallback while roles are being migrated to DB permissions
  return canAccessLegacyFeature(roleCode as RoleCode, feature);
}

export async function syncUserPermissions(
  userId: string,
  permissionIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(permissionIds)];

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    ...(uniqueIds.length > 0
      ? [
          prisma.userPermission.createMany({
            data: uniqueIds.map((permissionId) => ({
              userId,
              permissionId,
            })),
          }),
        ]
      : []),
  ]);
}

export async function syncRolePermissions(
  roleId: string,
  permissionIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(permissionIds)];

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    ...(uniqueIds.length > 0
      ? [
          prisma.rolePermission.createMany({
            data: uniqueIds.map((permissionId) => ({
              roleId,
              permissionId,
            })),
          }),
        ]
      : []),
  ]);
}

export function resolvePermissionIdsFromKeys(
  permissionRows: Array<{ id: string; module: string; submodule: string; action: string }>,
  keys: PermissionKey[],
): string[] {
  const normalizedKeys = uniquePermissionKeys(keys);
  const idByKey = new Map(
    permissionRows.map((row) => [permissionKey(row), row.id]),
  );
  const ids: string[] = [];
  for (const key of normalizedKeys) {
    const id = idByKey.get(permissionKey(key));
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}
