-- Clear any user-based assignee values before switching FK target
UPDATE "RepairJob" SET "assignedToId" = NULL WHERE "assignedToId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "RepairJob" DROP CONSTRAINT "RepairJob_assignedToId_fkey";

-- DropIndex
DROP INDEX "RepairJob_assignedToId_idx";

-- AlterTable
ALTER TABLE "RepairJob" RENAME COLUMN "assignedToId" TO "assignedToOfficeStaffId";

-- CreateIndex
CREATE INDEX "RepairJob_assignedToOfficeStaffId_idx" ON "RepairJob"("assignedToOfficeStaffId");

-- AddForeignKey
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_assignedToOfficeStaffId_fkey" FOREIGN KEY ("assignedToOfficeStaffId") REFERENCES "OfficeStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
