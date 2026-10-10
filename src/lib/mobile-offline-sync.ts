import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { MAX_PINNED_ROUTES, mobileAudioSelect, mobileRouteSelect, playableAudio, routeCard } from "./mobile-announcements";

export const OFFLINE_AUDIO_DAYS = 30;

export function syncRevision(userId: string, snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify([userId, snapshot])).digest("hex");
}

// One consistent snapshot. No per-audio metadata/HEAD requests or per-route query loop.
// A complete replacement snapshot also communicates removals/unpublishing/unpinning.
export async function getOfflineSnapshot(userId: string) {
  return prisma.$transaction(async (tx) => {
    const [routes, pins, settings, welcome] = await Promise.all([
      tx.announcementRoute.findMany({ where: { status: "published" }, orderBy: { routeCode: "asc" },
        select: { ...mobileRouteSelect, pinnedBy: { where: { userId }, select: { userId: true } } } }),
      tx.mobilePinnedRoute.findMany({ where: { userId, route: { status: "published" } }, orderBy: { slot: "asc" }, take: MAX_PINNED_ROUTES,
        select: { route: { select: { ...mobileRouteSelect,
          audios: { where: { audio: { status: "ready" } }, orderBy: { position: "asc" },
            select: { position: true, stopLabel: true, audio: { select: mobileAudioSelect } } },
        } } } }),
      tx.announcementSettings.findUnique({ where: { id: "default" }, select: { recordsDriveUrl: true,
        dinnerBreakAudio: { select: mobileAudioSelect }, toiletBreakAudio: { select: mobileAudioSelect } } }),
      tx.audioAsset.findMany({ where: { category: "welcome_note", status: "ready" }, select: mobileAudioSelect,
        orderBy: [{ title: "asc" }, { id: "asc" }] }),
    ]);
    const single = (id: string, name: string, asset: Parameters<typeof playableAudio>[0]) => {
      const audio = asset?.category === "common_audio" ? playableAudio(asset) : null;
      return { id, name, type: "SINGLE" as const, audioUrl: audio?.audioUrl ?? null, audio };
    };
    return {
      catalog: {
        routes: routes.map(({ pinnedBy, ...route }) => routeCard(route, pinnedBy.length > 0)),
        quickAnnouncements: [
          { id: "welcome-note", name: "Welcome Note", type: "MULTIPLE" as const,
            audios: welcome.flatMap((item) => { const audio = playableAudio(item); return audio ? [audio] : []; }) },
          single("dinner-break", "Dinner Break", settings?.dinnerBreakAudio),
          single("toilet-break", "Toilet Break", settings?.toiletBreakAudio),
        ],
        recordsDriveUrl: settings?.recordsDriveUrl ?? null, maxPinnedRoutes: MAX_PINNED_ROUTES,
      },
      pinnedRoutes: pins.map(({ route }) => ({ routeId: route.routeCode, route: routeCard(route, true),
        announcements: route.audios.flatMap(({ position, stopLabel, audio }) => {
          const item = playableAudio(audio);
          return item ? [{ ...item, title: stopLabel || item.title, sequence: position }] : [];
        }),
      })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
