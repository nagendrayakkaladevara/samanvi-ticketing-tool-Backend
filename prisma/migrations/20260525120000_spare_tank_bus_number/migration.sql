-- AlterTable: store bus number directly on spare tanks (no FK to Bus)
ALTER TABLE "SpareTank" ADD COLUMN "busNumber" VARCHAR(50);

UPDATE "SpareTank" st
SET "busNumber" = b."busNumber"
FROM "Bus" b
WHERE st."busId" = b."id";

ALTER TABLE "SpareTank" ALTER COLUMN "busNumber" SET NOT NULL;

DROP INDEX "SpareTank_busId_idx";

ALTER TABLE "SpareTank" DROP CONSTRAINT "SpareTank_busId_fkey";

ALTER TABLE "SpareTank" DROP COLUMN "busId";

CREATE INDEX "SpareTank_busNumber_idx" ON "SpareTank"("busNumber");
