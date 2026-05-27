import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_ROLE_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  permissionKey,
} from "./permission-catalog";
import { resolvePermissionIdsFromKeys } from "./permissions";

export async function seedPermissionCatalog(prisma: PrismaClient): Promise<void> {
  for (const definition of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: {
        module_submodule_action: {
          module: definition.module,
          submodule: definition.submodule,
          action: definition.action,
        },
      },
      update: {
        label: definition.label,
        sortOrder: definition.sortOrder,
      },
      create: definition,
    });
  }
}

export async function seedDefaultRolePermissions(
  prisma: PrismaClient,
): Promise<void> {
  const permissionRows = await prisma.permission.findMany({
    select: { id: true, module: true, submodule: true, action: true },
  });

  const roles = await prisma.role.findMany({
    select: { id: true, code: true },
  });

  for (const role of roles) {
    const keys = DEFAULT_ROLE_PERMISSION_KEYS[role.code];
    if (!keys || keys.length === 0) {
      continue;
    }

    const permissionIds = resolvePermissionIdsFromKeys(permissionRows, keys);
    if (permissionIds.length === 0) {
      continue;
    }

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }
}

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  await seedPermissionCatalog(prisma);
  await seedDefaultRolePermissions(prisma);
}

export function listMissingPermissionKeys(
  permissionRows: Array<{
    module: string;
    submodule: string;
    action: string;
  }>,
  keys: Array<{ module: string; submodule: string; action: string }>,
): string[] {
  const existing = new Set(permissionRows.map((row) => permissionKey(row)));
  return keys
    .map((key) => permissionKey(key))
    .filter((key) => !existing.has(key));
}
