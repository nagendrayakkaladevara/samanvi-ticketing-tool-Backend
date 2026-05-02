-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "slaDurationMs" BIGINT NOT NULL DEFAULT 0;

-- Best-effort backfill: original window for never-reopened tickets is exact; reopened tickets may be inflated (pre-fix data).
UPDATE "Ticket"
SET "slaDurationMs" = GREATEST(
  FLOOR(EXTRACT(EPOCH FROM ("slaDueAt" - "createdAt")) * 1000)::bigint,
  0
);
