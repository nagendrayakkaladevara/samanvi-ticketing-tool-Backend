import { AudioAssetStatus, AudioCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { validateRouteAudioSelection } from "./announcement-route";

describe("validateRouteAudioSelection", () => {
  const readyStop = {
    id: "audio-1",
    category: AudioCategory.stop_announcement,
    status: AudioAssetStatus.ready,
  };

  it("accepts ready stop announcements", () => {
    expect(validateRouteAudioSelection([readyStop.id], [readyStop])).toBeNull();
  });

  it("rejects duplicate audio ids", () => {
    expect(validateRouteAudioSelection([readyStop.id, readyStop.id], [readyStop])).toEqual({
      code: "DUPLICATE_AUDIO",
    });
  });

  it("rejects missing audio records", () => {
    expect(validateRouteAudioSelection([readyStop.id], [])).toEqual({
      code: "AUDIO_NOT_FOUND",
    });
  });

  it.each([AudioCategory.common_audio, AudioCategory.welcome_note])(
    "rejects %s audio",
    (category) => {
      expect(
        validateRouteAudioSelection(
          [readyStop.id],
          [{ ...readyStop, category }],
        ),
      ).toEqual({ code: "INVALID_AUDIO", audioId: readyStop.id });
    },
  );

  it("rejects an audio that is not ready", () => {
    expect(
      validateRouteAudioSelection(
        [readyStop.id],
        [{ ...readyStop, status: AudioAssetStatus.uploading }],
      ),
    ).toEqual({ code: "INVALID_AUDIO", audioId: readyStop.id });
  });
});
