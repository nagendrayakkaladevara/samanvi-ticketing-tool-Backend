-- CreateEnum
CREATE TYPE "RepairJobStatus" AS ENUM ('created', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "RepairJobPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateTable
CREATE TABLE "RepairCategory" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairPart" (
    "id" TEXT NOT NULL,
    "partName" VARCHAR(120) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairJob" (
    "id" TEXT NOT NULL,
    "jobIdNumber" VARCHAR(10) NOT NULL,
    "busId" TEXT NOT NULL,
    "odometerReading" INTEGER NOT NULL,
    "repairCategoryId" TEXT NOT NULL,
    "priority" "RepairJobPriority" NOT NULL,
    "reportedDriverId" TEXT,
    "assignedToId" TEXT,
    "description" TEXT NOT NULL,
    "status" "RepairJobStatus" NOT NULL DEFAULT 'created',
    "createdById" TEXT NOT NULL,
    "isRepeatJob" BOOLEAN NOT NULL DEFAULT false,
    "previousJobId" TEXT,
    "repeatScheduledFor" TIMESTAMP(3),
    "repeatProcessedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairJobPart" (
    "id" TEXT NOT NULL,
    "repairJobId" TEXT NOT NULL,
    "repairPartId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairJobPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairCategory_parentId_name_key" ON "RepairCategory"("parentId", "name");

-- CreateIndex
CREATE INDEX "RepairCategory_parentId_idx" ON "RepairCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairPart_partName_key" ON "RepairPart"("partName");

-- CreateIndex
CREATE UNIQUE INDEX "RepairJob_jobIdNumber_key" ON "RepairJob"("jobIdNumber");

-- CreateIndex
CREATE INDEX "RepairJob_assignedToId_idx" ON "RepairJob"("assignedToId");

-- CreateIndex
CREATE INDEX "RepairJob_status_idx" ON "RepairJob"("status");

-- CreateIndex
CREATE INDEX "RepairJob_deletedAt_idx" ON "RepairJob"("deletedAt");

-- CreateIndex
CREATE INDEX "RepairJob_repeatScheduledFor_idx" ON "RepairJob"("repeatScheduledFor");

-- CreateIndex
CREATE INDEX "RepairJob_busId_idx" ON "RepairJob"("busId");

-- CreateIndex
CREATE INDEX "RepairJobPart_repairJobId_idx" ON "RepairJobPart"("repairJobId");

-- AddForeignKey
ALTER TABLE "RepairCategory" ADD CONSTRAINT "RepairCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RepairCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_repairCategoryId_fkey" FOREIGN KEY ("repairCategoryId") REFERENCES "RepairCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_reportedDriverId_fkey" FOREIGN KEY ("reportedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_previousJobId_fkey" FOREIGN KEY ("previousJobId") REFERENCES "RepairJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJobPart" ADD CONSTRAINT "RepairJobPart_repairJobId_fkey" FOREIGN KEY ("repairJobId") REFERENCES "RepairJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJobPart" ADD CONSTRAINT "RepairJobPart_repairPartId_fkey" FOREIGN KEY ("repairPartId") REFERENCES "RepairPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairJobPart" ADD CONSTRAINT "RepairJobPart_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
