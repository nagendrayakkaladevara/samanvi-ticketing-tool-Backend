-- Mobile-driver identities are intentionally separate from admin application users.
CREATE TABLE "MobileDriverUser" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "driverId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MobileDriverUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobileDriverDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationIdHash" VARCHAR(64) NOT NULL,
    "platform" VARCHAR(20),
    "deviceName" VARCHAR(120),
    "osVersion" VARCHAR(50),
    "appVersion" VARCHAR(50),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MobileDriverDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobileDriverSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "refreshTokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revocationReason" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MobileDriverSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobileDriverAuthAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "adminActorId" TEXT,
    "eventType" VARCHAR(80) NOT NULL,
    "reason" VARCHAR(500),
    "metadata" JSONB,
    "requestId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MobileDriverAuthAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileDriverUser_username_key" ON "MobileDriverUser"("username");
CREATE UNIQUE INDEX "MobileDriverUser_driverId_key" ON "MobileDriverUser"("driverId");
CREATE INDEX "MobileDriverUser_isActive_deletedAt_idx" ON "MobileDriverUser"("isActive", "deletedAt");
CREATE INDEX "MobileDriverUser_displayName_idx" ON "MobileDriverUser"("displayName");
CREATE UNIQUE INDEX "MobileDriverDevice_userId_key" ON "MobileDriverDevice"("userId");
CREATE UNIQUE INDEX "MobileDriverSession_refreshTokenHash_key" ON "MobileDriverSession"("refreshTokenHash");
CREATE INDEX "MobileDriverSession_userId_revokedAt_idx" ON "MobileDriverSession"("userId", "revokedAt");
CREATE INDEX "MobileDriverSession_expiresAt_idx" ON "MobileDriverSession"("expiresAt");
CREATE INDEX "MobileDriverAuthAudit_userId_createdAt_idx" ON "MobileDriverAuthAudit"("userId", "createdAt" DESC);
CREATE INDEX "MobileDriverAuthAudit_adminActorId_createdAt_idx" ON "MobileDriverAuthAudit"("adminActorId", "createdAt" DESC);

ALTER TABLE "MobileDriverUser" ADD CONSTRAINT "MobileDriverUser_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MobileDriverUser" ADD CONSTRAINT "MobileDriverUser_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MobileDriverDevice" ADD CONSTRAINT "MobileDriverDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MobileDriverUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobileDriverSession" ADD CONSTRAINT "MobileDriverSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MobileDriverUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobileDriverSession" ADD CONSTRAINT "MobileDriverSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDriverDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MobileDriverAuthAudit" ADD CONSTRAINT "MobileDriverAuthAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MobileDriverUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MobileDriverAuthAudit" ADD CONSTRAINT "MobileDriverAuthAudit_adminActorId_fkey" FOREIGN KEY ("adminActorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add the new permissions without requiring a destructive reseed.
INSERT INTO "Permission" ("id", "module", "submodule", "action", "label", "sortOrder", "createdAt", "updatedAt") VALUES
('perm_ann_mobile_view', 'announcements', 'mobile_users', 'view', 'View', 900, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('perm_ann_mobile_create', 'announcements', 'mobile_users', 'create', 'Create New', 910, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('perm_ann_mobile_edit', 'announcements', 'mobile_users', 'edit', 'Edit', 920, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('perm_ann_mobile_status', 'announcements', 'mobile_users', 'change_status', 'Activate / Deactivate', 930, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('perm_ann_mobile_device', 'announcements', 'mobile_users', 'reset_device', 'Reset Device', 940, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('perm_ann_mobile_delete', 'announcements', 'mobile_users', 'delete', 'Delete', 950, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("module", "submodule", "action") DO UPDATE SET
  "label" = EXCLUDED."label",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."module" = 'announcements' AND p."submodule" = 'mobile_users'
WHERE r."code" = 'admin'
ON CONFLICT DO NOTHING;
