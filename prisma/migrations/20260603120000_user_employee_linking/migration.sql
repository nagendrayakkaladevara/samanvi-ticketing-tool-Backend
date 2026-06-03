-- CreateEnum
CREATE TYPE "LinkedEmployeeType" AS ENUM ('driver', 'helper', 'office_staff');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "linkedEmployeeType" "LinkedEmployeeType",
ADD COLUMN "linkedDriverId" TEXT,
ADD COLUMN "linkedHelperId" TEXT,
ADD COLUMN "linkedOfficeStaffId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_linkedDriverId_key" ON "User"("linkedDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "User_linkedHelperId_key" ON "User"("linkedHelperId");

-- CreateIndex
CREATE UNIQUE INDEX "User_linkedOfficeStaffId_key" ON "User"("linkedOfficeStaffId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_linkedDriverId_fkey" FOREIGN KEY ("linkedDriverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_linkedHelperId_fkey" FOREIGN KEY ("linkedHelperId") REFERENCES "Helper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_linkedOfficeStaffId_fkey" FOREIGN KEY ("linkedOfficeStaffId") REFERENCES "OfficeStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
