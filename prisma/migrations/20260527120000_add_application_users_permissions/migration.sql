-- Extend RoleCode enum with new user types
ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'chairman';
ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'collection_agent';

-- Add mobile number to users
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mobileNumber" VARCHAR(15);

CREATE UNIQUE INDEX IF NOT EXISTS "User_mobileNumber_key" ON "User"("mobileNumber");

-- Permission catalog
CREATE TABLE IF NOT EXISTS "Permission" (
    "id" TEXT NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "submodule" VARCHAR(80) NOT NULL DEFAULT '',
    "action" VARCHAR(50) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Permission_module_submodule_action_key"
    ON "Permission"("module", "submodule", "action");

CREATE INDEX IF NOT EXISTS "Permission_module_idx" ON "Permission"("module");

-- Role ↔ Permission junction
CREATE TABLE IF NOT EXISTS "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

ALTER TABLE "RolePermission"
    ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission"
    ADD CONSTRAINT "RolePermission_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User ↔ Permission junction (per-user overrides / direct assignment)
CREATE TABLE IF NOT EXISTS "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId", "permissionId")
);

ALTER TABLE "UserPermission"
    ADD CONSTRAINT "UserPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermission"
    ADD CONSTRAINT "UserPermission_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
