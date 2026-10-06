ALTER TABLE "AnnouncementRoute"
  ADD COLUMN "via" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN "busType" VARCHAR(6) NOT NULL DEFAULT 'Non-AC',
  ADD CONSTRAINT "AnnouncementRoute_busType_check" CHECK ("busType" IN ('AC', 'Non-AC'));

ALTER TABLE "AnnouncementSettings"
  ADD COLUMN "dinnerBreakAudioId" TEXT,
  ADD COLUMN "toiletBreakAudioId" TEXT,
  ADD COLUMN "recordsDriveUrl" VARCHAR(1000),
  ADD CONSTRAINT "AnnouncementSettings_dinnerBreakAudioId_fkey" FOREIGN KEY ("dinnerBreakAudioId") REFERENCES "AudioAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AnnouncementSettings_toiletBreakAudioId_fkey" FOREIGN KEY ("toiletBreakAudioId") REFERENCES "AudioAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MobilePinnedRoute" (
  "userId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobilePinnedRoute_pkey" PRIMARY KEY ("userId", "routeId"),
  CONSTRAINT "MobilePinnedRoute_slot_check" CHECK ("slot" BETWEEN 1 AND 3),
  CONSTRAINT "MobilePinnedRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MobileDriverUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobilePinnedRoute_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "AnnouncementRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MobilePinnedRoute_userId_slot_key" ON "MobilePinnedRoute"("userId", "slot");
CREATE INDEX "MobilePinnedRoute_routeId_idx" ON "MobilePinnedRoute"("routeId");
