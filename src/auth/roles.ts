export const ROLE_DEFINITIONS = [
  { code: "supervisor", label: "Supervisor" },
  { code: "worker", label: "Worker" },
  { code: "admin", label: "Admin" },
] as const;

export type RoleCode = (typeof ROLE_DEFINITIONS)[number]["code"];
export type RoleLabel = (typeof ROLE_DEFINITIONS)[number]["label"];

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
] as const;

export type Feature = (typeof FEATURES)[number];

export const roleFeatureMatrix: Record<RoleCode, readonly Feature[]> = {
  supervisor: ["create_ticket", "assign_ticket", "view_dashboard", "manage_buses"],
  worker: ["update_status", "view_dashboard"],
  admin: [
    "create_ticket",
    "assign_ticket",
    "update_status",
    "view_dashboard",
    "manage_users",
    "manage_categories",
    "manage_buses",
  ],
};

export function canAccessFeature(role: RoleCode, feature: Feature): boolean {
  return roleFeatureMatrix[role].includes(feature);
}
