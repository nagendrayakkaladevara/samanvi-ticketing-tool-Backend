import type { AudioAsset, AudioAssetStatus, AudioCategory } from "@prisma/client";

export const ANNOUNCEMENT_AUDIO_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
] as const;

export function serializeAudioAsset<T extends Pick<AudioAsset, "sizeBytes">>(
  audio: T,
): Omit<T, "sizeBytes"> & { sizeBytes: string } {
  return { ...audio, sizeBytes: audio.sizeBytes.toString() };
}

export interface AnnouncementAudioSummary {
  id: string;
  title: string;
  description: string | null;
  category: AudioCategory;
  originalFileName: string;
  mimeType: string;
  sizeBytes: string;
  durationMs: number | null;
  checksumSha256: string | null;
  status: AudioAssetStatus;
  blobUrl: string | null;
  downloadUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
