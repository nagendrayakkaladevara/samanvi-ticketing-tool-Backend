CREATE TABLE "AudioPlaybackAlert" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" VARCHAR(50) NOT NULL,
  "displayName" VARCHAR(100) NOT NULL,
  "audioId" TEXT NOT NULL,
  "audioTitle" VARCHAR(150) NOT NULL,
  "playCount" INTEGER NOT NULL,
  "playedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "readById" TEXT,
  CONSTRAINT "AudioPlaybackAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AudioPlaybackAlert_userId_eventId_key" ON "AudioPlaybackAlert"("userId", "eventId");
CREATE INDEX "AudioPlaybackAlert_readAt_playedAt_idx" ON "AudioPlaybackAlert"("readAt", "playedAt" DESC);
