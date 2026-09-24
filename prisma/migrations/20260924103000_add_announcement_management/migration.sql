-- CreateEnum
CREATE TYPE "AnnouncementRouteStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "AudioCategory" AS ENUM ('stop_announcement', 'common_audio', 'welcome_note');

-- CreateEnum
CREATE TYPE "AudioAssetStatus" AS ENUM ('uploading', 'ready', 'failed', 'archived');

-- CreateTable
CREATE TABLE "AnnouncementRoute" (
    "id" TEXT NOT NULL,
    "routeCode" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "origin" VARCHAR(120) NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "status" "AnnouncementRouteStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnnouncementRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioAsset" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "category" "AudioCategory" NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(500),
    "blobUrl" VARCHAR(1000),
    "downloadUrl" VARCHAR(1000),
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "durationMs" INTEGER,
    "checksumSha256" VARCHAR(64),
    "etag" VARCHAR(255),
    "status" "AudioAssetStatus" NOT NULL DEFAULT 'uploading',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteAudioAssignment" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "audioId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "stopLabel" VARCHAR(150),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RouteAudioAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RouteAudioAssignment_position_check" CHECK ("position" > 0)
);

-- CreateTable
CREATE TABLE "AnnouncementSettings" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'default',
    "activeWelcomeAudioId" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnnouncementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRoute_routeCode_key" ON "AnnouncementRoute"("routeCode");
CREATE INDEX "AnnouncementRoute_status_idx" ON "AnnouncementRoute"("status");
CREATE INDEX "AnnouncementRoute_name_idx" ON "AnnouncementRoute"("name");
CREATE UNIQUE INDEX "AudioAsset_storageKey_key" ON "AudioAsset"("storageKey");
CREATE INDEX "AudioAsset_category_status_idx" ON "AudioAsset"("category", "status");
CREATE INDEX "AudioAsset_title_idx" ON "AudioAsset"("title");
CREATE UNIQUE INDEX "RouteAudioAssignment_routeId_position_key" ON "RouteAudioAssignment"("routeId", "position");
CREATE UNIQUE INDEX "RouteAudioAssignment_routeId_audioId_key" ON "RouteAudioAssignment"("routeId", "audioId");
CREATE INDEX "RouteAudioAssignment_audioId_idx" ON "RouteAudioAssignment"("audioId");
CREATE UNIQUE INDEX "AnnouncementSettings_activeWelcomeAudioId_key" ON "AnnouncementSettings"("activeWelcomeAudioId");

-- AddForeignKey
ALTER TABLE "AnnouncementRoute" ADD CONSTRAINT "AnnouncementRoute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRoute" ADD CONSTRAINT "AnnouncementRoute_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AudioAsset" ADD CONSTRAINT "AudioAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteAudioAssignment" ADD CONSTRAINT "RouteAudioAssignment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "AnnouncementRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteAudioAssignment" ADD CONSTRAINT "RouteAudioAssignment_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "AudioAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnouncementSettings" ADD CONSTRAINT "AnnouncementSettings_activeWelcomeAudioId_fkey" FOREIGN KEY ("activeWelcomeAudioId") REFERENCES "AudioAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnnouncementSettings" ADD CONSTRAINT "AnnouncementSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: route assignments may only reference ready stop announcements.
CREATE FUNCTION validate_route_audio_assignment() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AudioAsset"
    WHERE "id" = NEW."audioId"
      AND "category" = 'stop_announcement'
      AND "status" = 'ready'
  ) THEN
    RAISE EXCEPTION 'Only ready stop announcements can be assigned to routes';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RouteAudioAssignment_validate_audio"
BEFORE INSERT OR UPDATE OF "audioId" ON "RouteAudioAssignment"
FOR EACH ROW EXECUTE FUNCTION validate_route_audio_assignment();
