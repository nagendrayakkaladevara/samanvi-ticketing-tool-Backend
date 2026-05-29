-- AlterEnum
ALTER TYPE "RepairJobStatus" ADD VALUE 'closed';

-- CreateEnum
CREATE TYPE "RepairJobActivityType" AS ENUM ('created', 'status_changed', 'commented', 'closed', 'cancelled');

-- AlterTable
ALTER TABLE "RepairJob" ADD COLUMN "closedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RepairJobActivityLog" (
    "id" TEXT NOT NULL,
    "repairJobId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actionType" "RepairJobActivityType" NOT NULL,
    "fromStatus" "RepairJobStatus",
    "toStatus" "RepairJobStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairJobActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairJobActivityLog_repairJobId_createdAt_idx" ON "RepairJobActivityLog"("repairJobId", "createdAt");

-- CreateIndex
CREATE INDEX "RepairJobActivityLog_actorUserId_createdAt_idx" ON "RepairJobActivityLog"("actorUserId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "RepairJobActivityLog" ADD CONSTRAINT "RepairJobActivityLog_repairJobId_fkey" FOREIGN KEY ("repairJobId") REFERENCES "RepairJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJobActivityLog" ADD CONSTRAINT "RepairJobActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
