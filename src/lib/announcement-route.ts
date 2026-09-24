import { AudioAssetStatus, AudioCategory } from "@prisma/client";

export interface RouteAudioCandidate {
  id: string;
  category: AudioCategory;
  status: AudioAssetStatus;
}

export type RouteAudioSelectionError =
  | { code: "DUPLICATE_AUDIO" }
  | { code: "AUDIO_NOT_FOUND" }
  | { code: "INVALID_AUDIO"; audioId: string };

export function validateRouteAudioSelection(
  requestedAudioIds: string[],
  candidates: RouteAudioCandidate[],
): RouteAudioSelectionError | null {
  if (new Set(requestedAudioIds).size !== requestedAudioIds.length) {
    return { code: "DUPLICATE_AUDIO" };
  }
  if (candidates.length !== requestedAudioIds.length) {
    return { code: "AUDIO_NOT_FOUND" };
  }
  const invalid = candidates.find(
    (audio) =>
      audio.category !== AudioCategory.stop_announcement ||
      audio.status !== AudioAssetStatus.ready,
  );
  return invalid ? { code: "INVALID_AUDIO", audioId: invalid.id } : null;
}
