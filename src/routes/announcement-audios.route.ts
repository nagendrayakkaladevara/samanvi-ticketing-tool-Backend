import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { AudioAssetStatus, AudioCategory, Prisma } from "@prisma/client";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import {
  ANNOUNCEMENT_AUDIO_CONTENT_TYPES,
  serializeAudioAsset,
} from "../lib/announcement-audio";
import { prisma } from "../lib/prisma";
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

const authorizeUploadToken: RequestHandler = (req, res, next) => {
  if ((req.body as { type?: string } | undefined)?.type === "blob.upload-completed") {
    next();
    return;
  }

  requireAuth(req, res, (authError?: unknown) => {
    if (authError) {
      next(authError);
      return;
    }
    requirePermission(audioPermission("upload"))(req, res, next);
  });
};

const announcementAudiosRouter = Router();

announcementAudiosRouter.post(
  "/audios/upload",
  authorizeUploadToken,
  asyncHandler(async (req, res) => {
    if (!env.blobReadWriteToken) {
      throw new Error("BLOB_READ_WRITE_TOKEN is required for audio uploads");
    }

    const body = req.body as HandleUploadBody;
    const result = await handleUpload({
      body,
      request: req,
      token: env.blobReadWriteToken,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!req.user) {
          throw new Error("Authenticated upload user is missing");
        }
        if (!pathname.startsWith("announcements/")) {
          throw badRequest("Audio uploads must use the announcements/ path");
        }

        let rawPayload: unknown;
        try {
          rawPayload = clientPayload ? JSON.parse(clientPayload) : undefined;
        } catch {
          throw badRequest("Invalid audio upload metadata");
        }
        const parsed = uploadPayloadSchema.safeParse(rawPayload);
        if (!parsed.success) {
          throw badRequest("Invalid audio upload metadata", {
            issues: parsed.error.issues,
          });
        }

        const audio = await prisma.audioAsset.create({
          data: {
            title: parsed.data.title,
            description: parsed.data.description,
            category: parsed.data.category,
            originalFileName: parsed.data.fileName,
            mimeType: parsed.data.mimeType,
            sizeBytes: BigInt(parsed.data.sizeBytes),
            durationMs: parsed.data.durationMs,
            createdById: req.user.sub,
          },
          select: { id: true },
        });

        return {
          allowedContentTypes: [...ANNOUNCEMENT_AUDIO_CONTENT_TYPES],
          maximumSizeInBytes: env.audioMaxSizeBytes,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: 31_536_000,
          tokenPayload: JSON.stringify({ audioId: audio.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: { audioId?: string };
        try {
          payload = tokenPayload ? JSON.parse(tokenPayload) : {};
        } catch {
          await del(blob.url, { token: env.blobReadWriteToken });
          throw new Error("Invalid audio upload completion payload");
        }
        if (!payload.audioId) {
          await del(blob.url, { token: env.blobReadWriteToken });
          throw new Error("Audio upload completion is missing the audio id");
        }

        await prisma.audioAsset.update({
          where: { id: payload.audioId },
          data: {
            storageKey: blob.pathname,
            blobUrl: blob.url,
            downloadUrl: blob.downloadUrl,
            mimeType: blob.contentType,
            etag: blob.etag,
            status: AudioAssetStatus.ready,
          },
        });
      },
    });

    res.status(200).json(result);
  }),
);

announcementAudiosRouter.use(requireAuth);

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
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { originalFileName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.audioAsset.findMany({
        where,
        select: audioSelect,
        orderBy: { createdAt: "desc" },
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
        _count: { select: { routeAssignments: true, activeInSettings: true } },
      },
    });
    if (!existing) {
      throw notFound("Audio asset not found");
    }
    if (
      parsed.data.category &&
      parsed.data.category !== existing.category &&
      (existing._count.routeAssignments > 0 || existing._count.activeInSettings > 0)
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
        _count: { select: { routeAssignments: true, activeInSettings: true } },
      },
    });
    if (!audio) {
      throw notFound("Audio asset not found");
    }
    if (audio._count.routeAssignments > 0 || audio._count.activeInSettings > 0) {
      throw conflict("Audio is in use and cannot be archived");
    }
    await prisma.audioAsset.update({
      where: { id: audio.id },
      data: { status: AudioAssetStatus.archived },
    });
    res.status(200).json({ success: true, data: { id: audio.id } });
  }),
);

export { announcementAudiosRouter };
