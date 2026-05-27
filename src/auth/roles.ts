export const ROLE_DEFINITIONS = [
  { code: "admin", label: "Admin" },
  { code: "supervisor", label: "Supervisor" },
  { code: "chairman", label: "Chairman" },
  { code: "accountant", label: "Accountant" },
  { code: "collection_agent", label: "Collection Agent" },
  { code: "worker", label: "Worker" },
] as const;

export type RoleCode = (typeof ROLE_DEFINITIONS)[number]["code"];
export type RoleLabel = (typeof ROLE_DEFINITIONS)[number]["label"];

/** User types manageable via the Application Users module (admin excluded from bulk edits). */
export const MANAGED_USER_TYPE_CODES = [
  "supervisor",
  "chairman",
  "accountant",
  "collection_agent",
  "worker",
] as const satisfies readonly RoleCode[];

export type ManagedUserTypeCode = (typeof MANAGED_USER_TYPE_CODES)[number];

export function getRoleLabel(code: RoleCode): RoleLabel {
  const role = ROLE_DEFINITIONS.find((item) => item.code === code);
  if (!role) {
    throw new Error(`Unknown role code: ${code}`);
  }
  return role.label;
}

export const FEATURES = [
  "create_ticket",
  "assign_ticket",
  "update_status",
  "view_dashboard",
  "manage_users",
  "manage_categories",
  "manage_buses",
  "manage_master",
  "create_garage_job",
  "manage_garage_job",
  "manage_garage_masters",
] as const;

export type Feature = (typeof FEATURES)[number];

export const roleFeatureMatrix: Record<RoleCode, readonly Feature[]> = {
  supervisor: [
    "create_ticket",
    "assign_ticket",
    "view_dashboard",
    "manage_buses",
    "manage_master",
    "create_garage_job",
    "manage_garage_job",
    "manage_garage_masters",
  ],
  chairman: ["view_dashboard"],
  accountant: ["view_dashboard"],
  collection_agent: ["update_status", "view_dashboard"],
  worker: ["update_status", "view_dashboard", "manage_garage_job"],
  admin: [
    "create_ticket",
    "assign_ticket",
    "update_status",
    "view_dashboard",
    "manage_users",
    "manage_categories",
    "manage_buses",
    "manage_master",
    "create_garage_job",
    "manage_garage_job",
    "manage_garage_masters",
  ],
};

export function canAccessFeature(role: RoleCode, feature: Feature): boolean {
  return roleFeatureMatrix[role].includes(feature);
}
