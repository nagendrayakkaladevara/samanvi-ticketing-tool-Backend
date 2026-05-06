ALTER TABLE "Ticket"
ADD COLUMN "ticketNumber" INTEGER;

DO $$
DECLARE
  ticket_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ticket_count FROM "Ticket";
  IF ticket_count > 9000 THEN
    RAISE EXCEPTION 'Cannot backfill 4-digit ticket numbers: % tickets exceed available range 1000-9999', ticket_count;
  END IF;
END $$;

WITH numbered_tickets AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) + 999 AS next_ticket_number
  FROM "Ticket"
)
UPDATE "Ticket" AS t
SET "ticketNumber" = nt.next_ticket_number
FROM numbered_tickets AS nt
WHERE t."id" = nt."id";

ALTER TABLE "Ticket"
ALTER COLUMN "ticketNumber" SET NOT NULL;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_ticketNumber_range_check" CHECK ("ticketNumber" BETWEEN 1000 AND 9999);

CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
