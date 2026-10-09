ALTER TABLE "AudioAsset" ADD COLUMN "archivedFromStatus" "AudioAssetStatus";

-- Older archives did not retain their previous status. Only assets with a
-- completed upload URL are restored as ready; unfinished uploads stay uploading.
UPDATE "AudioAsset"
SET "archivedFromStatus" = CASE
  WHEN "downloadUrl" IS NOT NULL OR "blobUrl" IS NOT NULL THEN 'ready'::"AudioAssetStatus"
  WHEN "storageKey" LIKE 'announcements/%' THEN 'uploading'::"AudioAssetStatus"
  ELSE 'failed'::"AudioAssetStatus"
END
WHERE "status" = 'archived';
