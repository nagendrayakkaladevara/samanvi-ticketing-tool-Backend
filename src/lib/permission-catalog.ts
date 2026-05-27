import type { Feature } from "../auth/roles";

export interface PermissionDefinition {
  module: string;
  submodule: string;
  action: string;
  label: string;
  sortOrder: number;
}

export interface PermissionKey {
  module: string;
  submodule: string;
  action: string;
}

export function permissionKey(value: PermissionKey): string {
  return `${value.module}:${value.submodule}:${value.action}`;
}

export function parsePermissionKey(key: string): PermissionKey {
  const [module, submodule, action] = key.split(":");
  if (!module || submodule === undefined || !action) {
    throw new Error(`Invalid permission key: ${key}`);
  }
  return { module, submodule, action };
}

/** Canonical permission catalog — add new modules/submodules/actions here. */
export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // Masters — Service For
  { module: "masters", submodule: "service_for", action: "view", label: "View", sortOrder: 10 },
  { module: "masters", submodule: "service_for", action: "create", label: "Create New", sortOrder: 20 },
  { module: "masters", submodule: "service_for", action: "edit", label: "Edit", sortOrder: 30 },
  { module: "masters", submodule: "service_for", action: "delete", label: "Delete", sortOrder: 40 },
  // Masters — Bus Number
  { module: "masters", submodule: "bus_number", action: "view", label: "View", sortOrder: 50 },
  { module: "masters", submodule: "bus_number", action: "create", label: "Create New", sortOrder: 60 },
  { module: "masters", submodule: "bus_number", action: "edit", label: "Edit", sortOrder: 70 },
  { module: "masters", submodule: "bus_number", action: "delete", label: "Delete", sortOrder: 80 },
  // Masters — Spare Tank
  { module: "masters", submodule: "spare_tank", action: "view", label: "View", sortOrder: 90 },
  { module: "masters", submodule: "spare_tank", action: "create", label: "Create New", sortOrder: 100 },
  { module: "masters", submodule: "spare_tank", action: "edit", label: "Edit", sortOrder: 110 },
  { module: "masters", submodule: "spare_tank", action: "delete", label: "Delete", sortOrder: 120 },
  // Masters — other submodules (drivers, helpers, office staff, service numbers)
  { module: "masters", submodule: "service_number", action: "view", label: "View", sortOrder: 130 },
  { module: "masters", submodule: "service_number", action: "create", label: "Create New", sortOrder: 140 },
  { module: "masters", submodule: "service_number", action: "edit", label: "Edit", sortOrder: 150 },
  { module: "masters", submodule: "service_number", action: "delete", label: "Delete", sortOrder: 160 },
  { module: "masters", submodule: "driver", action: "view", label: "View", sortOrder: 170 },
  { module: "masters", submodule: "driver", action: "create", label: "Create New", sortOrder: 180 },
  { module: "masters", submodule: "driver", action: "edit", label: "Edit", sortOrder: 190 },
  { module: "masters", submodule: "driver", action: "delete", label: "Delete", sortOrder: 200 },
  { module: "masters", submodule: "helper", action: "view", label: "View", sortOrder: 210 },
  { module: "masters", submodule: "helper", action: "create", label: "Create New", sortOrder: 220 },
  { module: "masters", submodule: "helper", action: "edit", label: "Edit", sortOrder: 230 },
  { module: "masters", submodule: "helper", action: "delete", label: "Delete", sortOrder: 240 },
  { module: "masters", submodule: "office_staff", action: "view", label: "View", sortOrder: 250 },
  { module: "masters", submodule: "office_staff", action: "create", label: "Create New", sortOrder: 260 },
  { module: "masters", submodule: "office_staff", action: "edit", label: "Edit", sortOrder: 270 },
  { module: "masters", submodule: "office_staff", action: "delete", label: "Delete", sortOrder: 280 },
  // Garage
  { module: "garage", submodule: "repair_category", action: "view", label: "View", sortOrder: 300 },
  { module: "garage", submodule: "repair_category", action: "create", label: "Create New", sortOrder: 310 },
  { module: "garage", submodule: "repair_category", action: "edit", label: "Edit", sortOrder: 320 },
  { module: "garage", submodule: "repair_category", action: "delete", label: "Delete", sortOrder: 330 },
  { module: "garage", submodule: "repair_part", action: "view", label: "View", sortOrder: 340 },
  { module: "garage", submodule: "repair_part", action: "create", label: "Create New", sortOrder: 350 },
  { module: "garage", submodule: "repair_part", action: "edit", label: "Edit", sortOrder: 360 },
  { module: "garage", submodule: "repair_part", action: "delete", label: "Delete", sortOrder: 370 },
  { module: "garage", submodule: "repair_job", action: "view", label: "View", sortOrder: 380 },
  { module: "garage", submodule: "repair_job", action: "create", label: "Create New", sortOrder: 390 },
  { module: "garage", submodule: "repair_job", action: "edit", label: "Edit", sortOrder: 400 },
  { module: "garage", submodule: "repair_job", action: "delete", label: "Delete", sortOrder: 410 },
  // Tickets
  { module: "tickets", submodule: "", action: "view", label: "View Dashboard", sortOrder: 500 },
  { module: "tickets", submodule: "", action: "create", label: "Create Ticket", sortOrder: 510 },
  { module: "tickets", submodule: "", action: "assign", label: "Assign Ticket", sortOrder: 520 },
  { module: "tickets", submodule: "", action: "update_status", label: "Update Status", sortOrder: 530 },
  // Issue categories
  { module: "issue_categories", submodule: "", action: "view", label: "View", sortOrder: 600 },
  { module: "issue_categories", submodule: "", action: "create", label: "Create New", sortOrder: 610 },
  { module: "issue_categories", submodule: "", action: "edit", label: "Edit", sortOrder: 620 },
  { module: "issue_categories", submodule: "", action: "delete", label: "Delete", sortOrder: 630 },
  // Application users
  { module: "users", submodule: "", action: "view", label: "View", sortOrder: 700 },
  { module: "users", submodule: "", action: "create", label: "Create New", sortOrder: 710 },
  { module: "users", submodule: "", action: "edit", label: "Edit", sortOrder: 720 },
  { module: "users", submodule: "", action: "delete", label: "Delete", sortOrder: 730 },
  { module: "users", submodule: "", action: "manage_permissions", label: "Manage Permissions", sortOrder: 740 },
];

export const MODULE_LABELS: Record<string, string> = {
  masters: "Masters",
  garage: "Garage",
  tickets: "Tickets",
  issue_categories: "Issue Categories",
  users: "Application Users",
};

export const SUBMODULE_LABELS: Record<string, string> = {
  service_for: "Service For",
  bus_number: "Bus Number",
  spare_tank: "Spare Tank",
  service_number: "Service Number",
  driver: "Driver",
  helper: "Helper",
  office_staff: "Office Staff",
  repair_category: "Repair Category",
  repair_part: "Repair Part",
  repair_job: "Repair Job",
};

/** Maps legacy feature flags to one or more permission keys for backward compatibility. */
export const LEGACY_FEATURE_PERMISSIONS: Record<Feature, PermissionKey[]> = {
  view_dashboard: [{ module: "tickets", submodule: "", action: "view" }],
  create_ticket: [{ module: "tickets", submodule: "", action: "create" }],
  assign_ticket: [{ module: "tickets", submodule: "", action: "assign" }],
  update_status: [{ module: "tickets", submodule: "", action: "update_status" }],
  manage_users: [
    { module: "users", submodule: "", action: "view" },
    { module: "users", submodule: "", action: "create" },
    { module: "users", submodule: "", action: "edit" },
    { module: "users", submodule: "", action: "delete" },
    { module: "users", submodule: "", action: "manage_permissions" },
  ],
  manage_categories: [
    { module: "issue_categories", submodule: "", action: "view" },
    { module: "issue_categories", submodule: "", action: "create" },
    { module: "issue_categories", submodule: "", action: "edit" },
    { module: "issue_categories", submodule: "", action: "delete" },
  ],
  manage_buses: [
    { module: "masters", submodule: "bus_number", action: "view" },
    { module: "masters", submodule: "bus_number", action: "create" },
    { module: "masters", submodule: "bus_number", action: "edit" },
    { module: "masters", submodule: "bus_number", action: "delete" },
  ],
  manage_master: PERMISSION_CATALOG.filter(
    (item) => item.module === "masters" && item.action !== "view",
  ).map(({ module, submodule, action }) => ({ module, submodule, action })),
  create_garage_job: [
    { module: "garage", submodule: "repair_job", action: "view" },
    { module: "garage", submodule: "repair_job", action: "create" },
  ],
  manage_garage_job: [
    { module: "garage", submodule: "repair_job", action: "view" },
    { module: "garage", submodule: "repair_job", action: "edit" },
  ],
  manage_garage_masters: PERMISSION_CATALOG.filter(
    (item) =>
      item.module === "garage" &&
      (item.submodule === "repair_category" || item.submodule === "repair_part") &&
      item.action !== "view",
  ).map(({ module, submodule, action }) => ({ module, submodule, action })),
};

/** Default role → permission keys seeded on first run (mirrors legacy matrix). */
export const DEFAULT_ROLE_PERMISSION_KEYS: Record<string, PermissionKey[]> = {
  admin: PERMISSION_CATALOG.map(({ module, submodule, action }) => ({
    module,
    submodule,
    action,
  })),
  supervisor: [
    ...LEGACY_FEATURE_PERMISSIONS.view_dashboard,
    ...LEGACY_FEATURE_PERMISSIONS.create_ticket,
    ...LEGACY_FEATURE_PERMISSIONS.assign_ticket,
    ...LEGACY_FEATURE_PERMISSIONS.manage_buses,
    ...LEGACY_FEATURE_PERMISSIONS.manage_master,
    ...LEGACY_FEATURE_PERMISSIONS.create_garage_job,
    ...LEGACY_FEATURE_PERMISSIONS.manage_garage_job,
    ...LEGACY_FEATURE_PERMISSIONS.manage_garage_masters,
    // read access to masters views
    ...PERMISSION_CATALOG.filter(
      (item) => item.module === "masters" && item.action === "view",
    ).map(({ module, submodule, action }) => ({ module, submodule, action })),
    ...PERMISSION_CATALOG.filter(
      (item) => item.module === "garage" && item.action === "view",
    ).map(({ module, submodule, action }) => ({ module, submodule, action })),
  ],
  worker: [
    ...LEGACY_FEATURE_PERMISSIONS.view_dashboard,
    ...LEGACY_FEATURE_PERMISSIONS.update_status,
    ...LEGACY_FEATURE_PERMISSIONS.manage_garage_job,
  ],
  collection_agent: [
    ...LEGACY_FEATURE_PERMISSIONS.view_dashboard,
    ...LEGACY_FEATURE_PERMISSIONS.update_status,
  ],
  chairman: [...LEGACY_FEATURE_PERMISSIONS.view_dashboard],
  accountant: [...LEGACY_FEATURE_PERMISSIONS.view_dashboard],
};

export interface PermissionTreeModule {
  module: string;
  label: string;
  submodules: PermissionTreeSubmodule[];
}

export interface PermissionTreeSubmodule {
  submodule: string;
  label: string;
  permissions: Array<{
    id?: string;
    action: string;
    label: string;
    key: string;
  }>;
}

export function buildPermissionTree(
  permissions: Array<{
    id: string;
    module: string;
    submodule: string;
    action: string;
    label: string;
    sortOrder: number;
  }>,
): PermissionTreeModule[] {
  const moduleMap = new Map<string, Map<string, PermissionTreeSubmodule>>();

  for (const permission of [...permissions].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )) {
    if (!moduleMap.has(permission.module)) {
      moduleMap.set(permission.module, new Map());
    }
    const submoduleMap = moduleMap.get(permission.module)!;
    if (!submoduleMap.has(permission.submodule)) {
      submoduleMap.set(permission.submodule, {
        submodule: permission.submodule,
        label:
          permission.submodule === ""
            ? MODULE_LABELS[permission.module] ?? permission.module
            : SUBMODULE_LABELS[permission.submodule] ?? permission.submodule,
        permissions: [],
      });
    }
    submoduleMap.get(permission.submodule)!.permissions.push({
      id: permission.id,
      action: permission.action,
      label: permission.label,
      key: permissionKey(permission),
    });
  }

  return [...moduleMap.entries()].map(([module, submodules]) => ({
    module,
    label: MODULE_LABELS[module] ?? module,
    submodules: [...submodules.values()],
  }));
}
