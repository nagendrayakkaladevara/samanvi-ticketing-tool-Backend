import { randomUUID } from "node:crypto";
import { AudioAssetStatus, AudioCategory, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import {
  ANNOUNCEMENT_AUDIO_CONTENT_TYPES,
  serializeAudioAsset,
} from "../lib/announcement-audio";
import { prisma } from "../lib/prisma";
import { createAudioUploadUrl, inspectAudioUpload, R2_UPLOAD_EXPIRES_SECONDS } from "../lib/r2-storage";
import { requireAuth, requirePermission } from "../middleware/auth";

const audioPermission = (action: string) => ({
  module: "announcements",
  submodule: "audios",
  action,
});

const uploadPayloadSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional(),
  category: z.nativeEnum(AudioCategory),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ANNOUNCEMENT_AUDIO_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(env.audioMaxSizeBytes),
  durationMs: z.number().int().positive().optional(),
});

const updateAudioSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    category: z.nativeEnum(AudioCategory).optional(),
    durationMs: z.number().int().positive().nullable().optional(),
    checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const listAudioQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(150).optional(),
  category: z.nativeEnum(AudioCategory).optional(),
  status: z.nativeEnum(AudioAssetStatus).optional(),
});

const audioSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  originalFileName: true,
  storageKey: true,
  blobUrl: true,
  downloadUrl: true,
  mimeType: true,
  sizeBytes: true,
  durationMs: true,
  checksumSha256: true,
  etag: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AudioAssetSelect;

function audioIdFrom(params: { audioId?: string | string[] }): string {
  if (!params.audioId || Array.isArray(params.audioId)) {
    throw badRequest("Invalid audio id");
  }
  return params.audioId;
}

const announcementAudiosRouter = Router();
announcementAudiosRouter.use(requireAuth);

announcementAudiosRouter.post(
  "/audios/upload",
  requirePermission(audioPermission("upload")),
  asyncHandler(async (req, res) => {
    const parsed = uploadPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid audio upload metadata", { issues: parsed.error.issues });
    }
    const storageKey = "announcements/" + randomUUID();
    const uploadUrl = await createAudioUploadUrl(storageKey, parsed.data.mimeType, parsed.data.sizeBytes);
    const audio = await prisma.audioAsset.create({
      data: {
        title: parsed.data.title, description: parsed.data.description,
        category: parsed.data.category, originalFileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType, sizeBytes: BigInt(parsed.data.sizeBytes),
        durationMs: parsed.data.durationMs, storageKey, createdById: req.user!.sub,
      },
      select: { id: true },
    });
    res.status(200).json({ success: true, data: {
      audioId: audio.id, uploadUrl, method: "PUT",
      headers: { "Content-Type": parsed.data.mimeType, "If-None-Match": "*" },
      expiresInSeconds: R2_UPLOAD_EXPIRES_SECONDS,
    } });
  }),
);

announcementAudiosRouter.post(
  "/audios/:audioId/upload-complete",
  requirePermission(audioPermission("upload")),
  asyncHandler(async (req, res) => {
    const audioId = audioIdFrom(req.params);
    const audio = await prisma.audioAsset.findUnique({ where: { id: audioId } });
    if (!audio || audio.createdById !== req.user!.sub) {
      throw notFound("Audio asset not found");
    }
    if (audio.status === AudioAssetStatus.ready) {
      res.status(200).json({ success: true, data: serializeAudioAsset(audio) });
      return;
    }
    if (audio.status !== AudioAssetStatus.uploading || !audio.storageKey?.startsWith("announcements/")) {
      throw conflict("Audio asset is not awaiting an upload");
    }
    const { object, url } = await inspectAudioUpload(audio.storageKey);
    if (object.ContentLength === undefined || BigInt(object.ContentLength) !== audio.sizeBytes ||
        object.ContentLength > env.audioMaxSizeBytes || object.ContentType !== audio.mimeType) {
      throw badRequest("Uploaded audio size or content type does not match its metadata");
    }
    const updated = await prisma.audioAsset.updateMany({
      where: { id: audio.id, status: AudioAssetStatus.uploading },
      data: { blobUrl: url, downloadUrl: url, etag: object.ETag, status: AudioAssetStatus.ready },
    });
    if (updated.count === 0) {
      throw conflict("Audio asset status changed while completing the upload");
    }
    const ready = await prisma.audioAsset.findUniqueOrThrow({ where: { id: audio.id }, select: audioSelect });
    res.status(200).json({ success: true, data: serializeAudioAsset(ready) });
  }),
);

announcementAudiosRouter.get(
  "/audios",
  requirePermission(audioPermission("view")),
  asyncHandler(async (req, res) => {
    const parsed = listAudioQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid audio query", { issues: parsed.error.issues });
    }
    const { page, pageSize, search, category, status } = parsed.data;
    const where: Prisma.AudioAssetWhereInput = {
      ...(category ? { category } : {}),
      status: status ?? { not: AudioAssetStatus.archived },
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { originalFileName: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.audioAsset.findMany({
        where,
        select: audioSelect,
        orderBy: status === AudioAssetStatus.archived ? { updatedAt: "desc" } : { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.audioAsset.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items: items.map(serializeAudioAsset),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
    });
  }),
);

announcementAudiosRouter.get(
  "/audios/:audioId",
  requirePermission(audioPermission("view")),
  asyncHandler(async (req, res) => {
    const audioId = audioIdFrom(req.params);
    const audio = await prisma.audioAsset.findUnique({
      where: { id: audioId },
      select: {
        ...audioSelect,
        routeAssignments: {
          orderBy: { route: { name: "asc" } },
          select: {
            position: true,
            stopLabel: true,
            route: { select: { id: true, routeCode: true, name: true, status: true } },
          },
        },
      },
    });
    if (!audio) {
      throw notFound("Audio asset not found");
    }
    res.status(200).json({ success: true, data: serializeAudioAsset(audio) });
  }),
);

announcementAudiosRouter.get(
  "/audios/:audioId/usage",
  requirePermission(audioPermission("view")),
  asyncHandler(async (req, res) => {
    const audioId = audioIdFrom(req.params);
    const audio = await prisma.audioAsset.findUnique({
      where: { id: audioId },
      select: { id: true },
    });
    if (!audio) {
      throw notFound("Audio asset not found");
    }
    const items = await prisma.routeAudioAssignment.findMany({
      where: { audioId: audio.id },
      orderBy: [{ route: { name: "asc" } }, { position: "asc" }],
      select: {
        position: true,
        stopLabel: true,
        route: { select: { id: true, routeCode: true, name: true, status: true } },
      },
    });
    res.status(200).json({ success: true, data: { items } });
  }),
);

announcementAudiosRouter.patch(
  "/audios/:audioId",
  requirePermission(audioPermission("edit")),
  asyncHandler(async (req, res) => {
    const audioId = audioIdFrom(req.params);
    const parsed = updateAudioSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid audio payload", { issues: parsed.error.issues });
    }
    const existing = await prisma.audioAsset.findUnique({
      where: { id: audioId },
      select: {
        id: true,
        category: true,
        status: true,
        _count: { select: { routeAssignments: true, dinnerInSettings: true, toiletInSettings: true } },
      },
    });
    if (!existing) {
      throw notFound("Audio asset not found");
    }
    if (existing.status === AudioAssetStatus.archived) {
      throw conflict("Deleted audio must be restored before editing");
    }
    if (
      parsed.data.category &&
      parsed.data.category !== existing.category &&
      (existing._count.routeAssignments > 0 || existing._count.dinnerInSettings > 0 || existing._count.toiletInSettings > 0)
    ) {
      throw conflict("Audio category cannot be changed while the audio is in use");
    }

    const audio = await prisma.audioAsset.update({
      where: { id: existing.id },
      data: parsed.data,
      select: audioSelect,
    });
    res.status(200).json({ success: true, data: serializeAudioAsset(audio) });
  }),
);

announcementAudiosRouter.delete(
  "/audios/:audioId",
  requirePermission(audioPermission("delete")),
  asyncHandler(async (req, res) => {
    const audioId = audioIdFrom(req.params);
    const audio = await prisma.audioAsset.findUnique({
      where: { id: audioId },
      select: {
        id: true,
        status: true,
        _count: { select: { routeAssignments: true, activeInSettings: true, dinnerInSettings: true, toiletInSettings: true } },
      },
    });
    if (!audio) {
      throw notFound("Audio asset not found");
    }
    if (audio._count.routeAssignments > 0 || audio._count.activeInSettings > 0 || audio._count.dinnerInSettings > 0 || audio._count.toiletInSettings > 0) {
      throw conflict("Audio is in use. Remove it from routes and mobile settings before deleting it");
    }
    if (audio.status !== AudioAssetStatus.archived) {
      const updated = await prisma.audioAsset.updateMany({
        where: {
          id: audio.id, status: audio.status,
          routeAssignments: { none: {} }, activeInSettings: { none: {} },
          dinnerInSettings: { none: {} }, toiletInSettings: { none: {} },
        },
        data: { status: AudioAssetStatus.archived, archivedFromStatus: audio.status },
      });
      if (updated.count === 0) {
        throw conflict("Audio changed or is now in use. Refresh and try again");
      }
    }
    res.status(200).json({ success: true, data: { id: audio.id } });
  }),
);

announcementAudiosRouter.post(
  "/audios/:audioId/restore",
  requirePermission(audioPermission("delete")),
  asyncHandler(async (req, res) => {
    const audioId = audioIdFrom(req.params);
    const audio = await prisma.audioAsset.findUnique({ where: { id: audioId } });
    if (!audio) {
      throw notFound("Audio asset not found");
    }
    if (audio.status !== AudioAssetStatus.archived) {
      throw conflict("Only deleted audio can be restored");
    }
    const status = audio.archivedFromStatus;
    if (!status || status === AudioAssetStatus.archived) {
      throw conflict("The previous audio status is unavailable; upload the audio again");
    }
    const updated = await prisma.audioAsset.updateMany({
      where: { id: audio.id, status: AudioAssetStatus.archived },
      data: { status, archivedFromStatus: null },
    });
    if (updated.count === 0) {
      throw conflict("Audio changed while restoring. Refresh and try again");
    }
    const restored = await prisma.audioAsset.findUniqueOrThrow({ where: { id: audio.id }, select: audioSelect });
    res.status(200).json({ success: true, data: serializeAudioAsset(restored) });
  }),
);

export { announcementAudiosRouter };
