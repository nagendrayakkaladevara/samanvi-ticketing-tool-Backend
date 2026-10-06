import { AudioAssetStatus, AudioCategory, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { notFound } from "../core/errors/http-errors";
import { AppError } from "../core/errors/app-error";

export const MAX_PINNED_ROUTES = 3;

export const mobileAudioSelect = {
  id: true, title: true, mimeType: true, durationMs: true,
  downloadUrl: true, blobUrl: true, status: true, category: true,
} satisfies Prisma.AudioAssetSelect;
type MobileAudio = Prisma.AudioAssetGetPayload<{ select: typeof mobileAudioSelect }>;

export function playableAudio(audio: MobileAudio | null | undefined) {
  if (!audio || audio.status !== AudioAssetStatus.ready) return null;
  const audioUrl = audio.downloadUrl ?? audio.blobUrl;
  try {
    if (!audioUrl || new URL(audioUrl).protocol !== "https:") return null;
  } catch { return null; }
  return { id: audio.id, title: audio.title, audioUrl, mimeType: audio.mimeType, durationMs: audio.durationMs };
}

export const mobileRouteSelect = {
  id: true, routeCode: true, origin: true, destination: true, via: true, busType: true,
} satisfies Prisma.AnnouncementRouteSelect;
type MobileRoute = Prisma.AnnouncementRouteGetPayload<{ select: typeof mobileRouteSelect }>;

export function routeCard(route: MobileRoute, isPinned: boolean) {
  return {
    id: route.id, routeId: route.routeCode, startLocation: route.origin,
    endLocation: route.destination, via: route.via, busType: route.busType, isPinned,
  };
}

export async function listMobileRoutes(userId: string, search?: string) {
  const routes = await prisma.announcementRoute.findMany({
    where: {
      status: "published",
      ...(search ? { OR: ["routeCode", "name", "origin", "destination", "via"].map((field) => ({
        [field]: { contains: search, mode: "insensitive" },
      })) } : {}),
    },
    orderBy: { routeCode: "asc" },
    select: { ...mobileRouteSelect, pinnedBy: { where: { userId }, select: { userId: true } } },
  });
  return routes.map(({ pinnedBy, ...route }) => routeCard(route, pinnedBy.length > 0));
}

export async function listPinnedRoutes(userId: string) {
  const pins = await prisma.mobilePinnedRoute.findMany({
    where: { userId, route: { status: "published" } },
    orderBy: { slot: "asc" },
    select: { route: { select: mobileRouteSelect } },
  });
  return pins.map(({ route }) => routeCard(route, true));
}

export async function setRoutePinned(userId: string, routeId: string, pinned: boolean) {
  await prisma.$transaction(async (tx) => {
    // Serialize all pin/unpin operations for this driver, including concurrent requests.
    await tx.$queryRaw`SELECT "id" FROM "MobileDriverUser" WHERE "id" = ${userId} FOR UPDATE`;
    if (!pinned) {
      await tx.mobilePinnedRoute.deleteMany({ where: { userId, routeId } });
      return;
    }
    const route = await tx.announcementRoute.findFirst({ where: { id: routeId, status: "published" }, select: { id: true } });
    if (!route) throw notFound("Published announcement route not found");
    // Unpublished routes should not consume a driver's available pin slots.
    await tx.mobilePinnedRoute.deleteMany({ where: { userId, route: { status: { not: "published" } } } });
    const pins = await tx.mobilePinnedRoute.findMany({ where: { userId }, select: { routeId: true, slot: true } });
    if (pins.some((pin) => pin.routeId === routeId)) return;
    const slot = Array.from({ length: MAX_PINNED_ROUTES }, (_, i) => i + 1).find((value) => !pins.some((pin) => pin.slot === value));
    if (!slot) throw new AppError({
      statusCode: 409, code: "PIN_LIMIT_REACHED",
      message: "You can pin up to 3 routes. Unpin a route before pinning another.",
      details: { maxPinnedRoutes: MAX_PINNED_ROUTES },
    });
    // Unique (userId, slot) plus a DB CHECK (1..3) also enforces the limit at rest.
    await tx.mobilePinnedRoute.create({ data: { userId, routeId, slot } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function getQuickAnnouncements() {
  const [settings, welcome] = await Promise.all([
    prisma.announcementSettings.findUnique({ where: { id: "default" }, include: {
      dinnerBreakAudio: { select: mobileAudioSelect }, toiletBreakAudio: { select: mobileAudioSelect },
    } }),
    prisma.audioAsset.findMany({ where: { category: AudioCategory.welcome_note, status: "ready" }, select: mobileAudioSelect, orderBy: [{ title: "asc" }, { id: "asc" }] }),
  ]);
  const single = (id: string, name: string, audio: MobileAudio | null | undefined) => {
    const playable = audio?.category === "common_audio" ? playableAudio(audio) : null;
    return { id, name, type: "SINGLE" as const, audioUrl: playable?.audioUrl ?? null, audio: playable };
  };
  return [
    { id: "welcome-note", name: "Welcome Note", type: "MULTIPLE" as const, audios: welcome.flatMap((audio) => { const playable = playableAudio(audio); return playable ? [playable] : []; }) },
    single("dinner-break", "Dinner Break", settings?.dinnerBreakAudio),
    single("toilet-break", "Toilet Break", settings?.toiletBreakAudio),
  ];
}
