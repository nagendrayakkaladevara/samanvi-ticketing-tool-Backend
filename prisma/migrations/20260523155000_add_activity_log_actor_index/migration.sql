-- CreateIndex
CREATE INDEX "TicketActivityLog_actorUserId_createdAt_idx" ON "TicketActivityLog"("actorUserId", "createdAt" DESC);
