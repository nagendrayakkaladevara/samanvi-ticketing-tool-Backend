/*
  Warnings:

  - Added the required column `chassisNumber` to the `Bus` table without a default value. This is not possible if the table is not empty.
  - Added the required column `engineNumber` to the `Bus` table without a default value. This is not possible if the table is not empty.
  - Added the required column `insuranceValidity` to the `Bus` table without a default value. This is not possible if the table is not empty.
  - Added the required column `odometer` to the `Bus` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: add nullable columns first, backfill existing buses, then enforce NOT NULL
ALTER TABLE "Bus" ADD COLUMN "aitpAuthorizationValidity" TIMESTAMP(3),
ADD COLUMN "aitpValidity" TIMESTAMP(3),
ADD COLUMN "basePermitValidity" TIMESTAMP(3),
ADD COLUMN "chassisNumber" VARCHAR(80),
ADD COLUMN "engineNumber" VARCHAR(80),
ADD COLUMN "fcValidity" TIMESTAMP(3),
ADD COLUMN "homeTaxValidity" TIMESTAMP(3),
ADD COLUMN "insuranceValidity" TIMESTAMP(3),
ADD COLUMN "odometer" INTEGER,
ADD COLUMN "pollutionValidity" TIMESTAMP(3),
ADD COLUMN "purchaseDate" TIMESTAMP(3),
ADD COLUMN "remarks" VARCHAR(500),
ADD COLUMN "serviceOutDate" TIMESTAMP(3);

UPDATE "Bus"
SET
  "engineNumber" = COALESCE("engineNumber", CONCAT('ENG-', "busNumber")),
  "chassisNumber" = COALESCE("chassisNumber", CONCAT('CHS-', "busNumber")),
  "odometer" = COALESCE("odometer", 0),
  "insuranceValidity" = COALESCE("insuranceValidity", CURRENT_TIMESTAMP + INTERVAL '1 year');

ALTER TABLE "Bus"
  ALTER COLUMN "chassisNumber" SET NOT NULL,
  ALTER COLUMN "engineNumber" SET NOT NULL,
  ALTER COLUMN "insuranceValidity" SET NOT NULL,
  ALTER COLUMN "odometer" SET NOT NULL;

-- CreateTable
CREATE TABLE "ServiceFor" (
    "id" TEXT NOT NULL,
    "serviceFor" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceFor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpareTank" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "ownerName" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpareTank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceNumber" (
    "id" TEXT NOT NULL,
    "serviceForId" TEXT NOT NULL,
    "serviceNo" VARCHAR(50) NOT NULL,
    "from" VARCHAR(120) NOT NULL,
    "to" VARCHAR(120) NOT NULL,
    "via" VARCHAR(120) NOT NULL,
    "parkingAmount" DECIMAL(12,2) NOT NULL,
    "driverOneBeta" DECIMAL(12,2) NOT NULL,
    "driverTwoBeta" DECIMAL(12,2) NOT NULL,
    "helperBeta" DECIMAL(12,2) NOT NULL,
    "conductorBeta" DECIMAL(12,2) NOT NULL,
    "distance" DECIMAL(12,2) NOT NULL,
    "optDriver" VARCHAR(120) NOT NULL,
    "optHelper" VARCHAR(120) NOT NULL,
    "remarks" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "driverIdNumber" VARCHAR(10) NOT NULL,
    "aadharName" VARCHAR(120) NOT NULL,
    "dlName" VARCHAR(120) NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "mobileNumber" VARCHAR(10) NOT NULL,
    "alternateMobile" VARCHAR(10),
    "emergencyNumber" VARCHAR(10),
    "aadharNumber" VARCHAR(12) NOT NULL,
    "dlNumber" VARCHAR(30) NOT NULL,
    "accountHolderName" VARCHAR(120) NOT NULL,
    "accountNumber" VARCHAR(30) NOT NULL,
    "bankName" VARCHAR(120) NOT NULL,
    "branchName" VARCHAR(120) NOT NULL,
    "ifscCode" VARCHAR(11) NOT NULL,
    "upiId" VARCHAR(120),
    "dlIssueDate" TIMESTAMP(3) NOT NULL,
    "dlExpiryDate" TIMESTAMP(3) NOT NULL,
    "transportIssueDate" TIMESTAMP(3) NOT NULL,
    "transportValidFrom" TIMESTAMP(3) NOT NULL,
    "transportValidTo" TIMESTAMP(3) NOT NULL,
    "dateOfJoining" TIMESTAMP(3) NOT NULL,
    "dateOfLeaving" TIMESTAMP(3),
    "referenceName" VARCHAR(120) NOT NULL,
    "remarks" VARCHAR(500),
    "aadharCardFront" BYTEA NOT NULL,
    "aadharCardBack" BYTEA NOT NULL,
    "dlFront" BYTEA NOT NULL,
    "dlBack" BYTEA NOT NULL,
    "upiScanner" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Helper" (
    "id" TEXT NOT NULL,
    "helperIdNumber" VARCHAR(10) NOT NULL,
    "nickName" VARCHAR(120) NOT NULL,
    "aadharName" VARCHAR(120) NOT NULL,
    "mobileNumber" VARCHAR(10) NOT NULL,
    "alternateNumber" VARCHAR(10),
    "emergencyMobile" VARCHAR(10),
    "aadharNumber" VARCHAR(12) NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "accountHolderName" VARCHAR(120) NOT NULL,
    "accountNumber" VARCHAR(30) NOT NULL,
    "bankName" VARCHAR(120) NOT NULL,
    "branchName" VARCHAR(120) NOT NULL,
    "ifscCode" VARCHAR(11) NOT NULL,
    "upiId" VARCHAR(120),
    "dateOfJoining" TIMESTAMP(3) NOT NULL,
    "dateOfLeaving" TIMESTAMP(3),
    "remarks" VARCHAR(500),
    "aadharCardFront" BYTEA NOT NULL,
    "aadharCardBack" BYTEA NOT NULL,
    "upiScanner" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Helper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeStaff" (
    "id" TEXT NOT NULL,
    "staffIdNumber" VARCHAR(10) NOT NULL,
    "designation" VARCHAR(120) NOT NULL,
    "nickName" VARCHAR(120) NOT NULL,
    "aadharName" VARCHAR(120) NOT NULL,
    "mobileNumber" VARCHAR(10) NOT NULL,
    "alternativeMobile" VARCHAR(10),
    "emergencyContact" VARCHAR(10),
    "aadharNumber" VARCHAR(12) NOT NULL,
    "referenceName" VARCHAR(120) NOT NULL,
    "accountHolderName" VARCHAR(120) NOT NULL,
    "accountNumber" VARCHAR(30) NOT NULL,
    "bankName" VARCHAR(120) NOT NULL,
    "branchName" VARCHAR(120) NOT NULL,
    "ifscCode" VARCHAR(11) NOT NULL,
    "upiId" VARCHAR(120),
    "dateOfJoining" TIMESTAMP(3) NOT NULL,
    "dateOfLeaving" TIMESTAMP(3),
    "remarks" VARCHAR(500),
    "aadharCardFront" BYTEA NOT NULL,
    "aadharCardBack" BYTEA NOT NULL,
    "upiScanner" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFor_serviceFor_key" ON "ServiceFor"("serviceFor");

-- CreateIndex
CREATE INDEX "SpareTank_busId_idx" ON "SpareTank"("busId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNumber_serviceNo_key" ON "ServiceNumber"("serviceNo");

-- CreateIndex
CREATE INDEX "ServiceNumber_serviceForId_idx" ON "ServiceNumber"("serviceForId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_driverIdNumber_key" ON "Driver"("driverIdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_aadharNumber_key" ON "Driver"("aadharNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_dlNumber_key" ON "Driver"("dlNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Helper_helperIdNumber_key" ON "Helper"("helperIdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Helper_aadharNumber_key" ON "Helper"("aadharNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeStaff_staffIdNumber_key" ON "OfficeStaff"("staffIdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeStaff_aadharNumber_key" ON "OfficeStaff"("aadharNumber");

-- AddForeignKey
ALTER TABLE "SpareTank" ADD CONSTRAINT "SpareTank_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNumber" ADD CONSTRAINT "ServiceNumber_serviceForId_fkey" FOREIGN KEY ("serviceForId") REFERENCES "ServiceFor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
