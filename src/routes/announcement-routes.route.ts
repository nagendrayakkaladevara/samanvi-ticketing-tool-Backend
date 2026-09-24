import {
  AnnouncementRouteStatus,
  Prisma,
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { serializeAudioAsset } from "../lib/announcement-audio";
import { validateRouteAudioSelection } from "../lib/announcement-route";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";

const routePermission = (action: string) => ({
  module: "announcements",
  submodule: "routes",
  action,
});

const createRouteSchema = z.object({
  routeCode: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/, "Use only letters, numbers, hyphens and underscores")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  origin: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
});

const updateRouteSchema = z
  .object({
    routeCode: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    name: z.string().trim().min(1).max(150).optional(),
    origin: z.string().trim().min(1).max(120).optional(),
    destination: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    status: z.nativeEnum(AnnouncementRouteStatus).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), {
    message: "At least one route field must be provided",
  });

const assignAudiosSchema = z.object({
  expectedVersion: z.number().int().positive(),
  items: z
    .array(
      z.object({
        audioId: z.string().trim().min(1),
        stopLabel: z.string().trim().max(150).nullable().optional(),
      }),
    )
    .max(500),
});

const listRoutesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(150).optional(),
  status: z.nativeEnum(AnnouncementRouteStatus).optional(),
});

const routeDetailArgs = Prisma.validator<Prisma.AnnouncementRouteDefaultArgs>()({
  select: {
    id: true,
    routeCode: true,
    name: true,
    origin: true,
    destination: true,
    description: true,
    status: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    audios: {
      orderBy: { position: "asc" },
      select: {
        id: true,
        position: true,
        stopLabel: true,
        audio: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            originalFileName: true,
            mimeType: true,
            sizeBytes: true,
            durationMs: true,
            checksumSha256: true,
            status: true,
            blobUrl: true,
            downloadUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    },
  },
});

const routeDetailSelect = routeDetailArgs.select;
type RouteDetail = Prisma.AnnouncementRouteGetPayload<typeof routeDetailArgs>;

function serializeRoute(route: RouteDetail) {
  return {
    ...route,
    audios: route.audios.map((assignment) => ({
      ...assignment,
      audio: serializeAudioAsset(assignment.audio),
    })),
  };
}

function routeIdFrom(params: { routeId?: string | string[] }): string {
  if (!params.routeId || Array.isArray(params.routeId)) {
    throw badRequest("Invalid route id");
  }
  return params.routeId;
}

const announcementRoutesRouter = Router();
announcementRoutesRouter.use(requireAuth);

announcementRoutesRouter.get(
  "/routes",
  requirePermission(routePermission("view")),
  asyncHandler(async (req, res) => {
    const parsed = listRoutesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid route query", { issues: parsed.error.issues });
    }
    const { page, pageSize, search, status } = parsed.data;
    const where: Prisma.AnnouncementRouteWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { routeCode: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              { origin: { contains: search, mode: "insensitive" } },
              { destination: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.announcementRoute.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          routeCode: true,
          name: true,
          origin: true,
          destination: true,
          status: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { audios: true } },
        },
      }),
      prisma.announcementRoute.count({ where }),
    ]);
    res.status(200).json({
      success: true,
      data: {
        items,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
    });
  }),
);

announcementRoutesRouter.post(
  "/routes",
  requirePermission(routePermission("create")),
  asyncHandler(async (req, res) => {
    const parsed = createRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid route payload", { issues: parsed.error.issues });
    }
    try {
      const route = await prisma.announcementRoute.create({
        data: {
          ...parsed.data,
          createdById: req.user!.sub,
          updatedById: req.user!.sub,
        },
        select: routeDetailSelect,
      });
      res.status(201).json({ success: true, data: serializeRoute(route) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflict("Route code already exists");
      }
      throw error;
    }
  }),
);

announcementRoutesRouter.get(
  "/routes/:routeId",
  requirePermission(routePermission("view")),
  asyncHandler(async (req, res) => {
    const routeId = routeIdFrom(req.params);
    const route = await prisma.announcementRoute.findUnique({
      where: { id: routeId },
      select: routeDetailSelect,
    });
    if (!route) {
      throw notFound("Announcement route not found");
    }
    res.status(200).json({ success: true, data: serializeRoute(route) });
  }),
);

announcementRoutesRouter.patch(
  "/routes/:routeId",
  requirePermission(routePermission("edit")),
  asyncHandler(async (req, res) => {
    const routeId = routeIdFrom(req.params);
    const parsed = updateRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid route payload", { issues: parsed.error.issues });
    }
    const { expectedVersion, ...changes } = parsed.data;

    if (changes.status === AnnouncementRouteStatus.published) {
      const assignmentCount = await prisma.routeAudioAssignment.count({
        where: { routeId },
      });
      if (assignmentCount === 0) {
        throw conflict("A route must contain at least one announcement before publishing");
      }
    }

    try {
      const result = await prisma.announcementRoute.updateMany({
        where: { id: routeId, version: expectedVersion },
        data: { ...changes, updatedById: req.user!.sub, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const exists = await prisma.announcementRoute.findUnique({
          where: { id: routeId },
          select: { id: true },
        });
        if (!exists) {
          throw notFound("Announcement route not found");
        }
        throw conflict("Route was modified by another user; refresh and try again");
      }
      const route = await prisma.announcementRoute.findUniqueOrThrow({
        where: { id: routeId },
        select: routeDetailSelect,
      });
      res.status(200).json({ success: true, data: serializeRoute(route) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflict("Route code already exists");
      }
      throw error;
    }
  }),
);

announcementRoutesRouter.put(
  "/routes/:routeId/audios",
  requirePermission(routePermission("assign_audio")),
  asyncHandler(async (req, res) => {
    const routeId = routeIdFrom(req.params);
    const parsed = assignAudiosSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid route audio payload", { issues: parsed.error.issues });
    }
    const audioIds = parsed.data.items.map((item) => item.audioId);
    const audios = await prisma.audioAsset.findMany({
      where: { id: { in: audioIds } },
      select: { id: true, category: true, status: true },
    });
    const selectionError = validateRouteAudioSelection(audioIds, audios);
    if (selectionError?.code === "DUPLICATE_AUDIO") {
      throw badRequest("An audio can only appear once in a route");
    }
    if (selectionError?.code === "AUDIO_NOT_FOUND") {
      throw badRequest("One or more audio assets do not exist");
    }
    if (selectionError?.code === "INVALID_AUDIO") {
      throw badRequest("Only ready stop announcements can be assigned to a route", {
        audioId: selectionError.audioId,
      });
    }

    const route = await prisma.$transaction(
      async (tx) => {
        const update = await tx.announcementRoute.updateMany({
          where: {
            id: routeId,
            version: parsed.data.expectedVersion,
            status: { not: AnnouncementRouteStatus.archived },
          },
          data: { version: { increment: 1 }, updatedById: req.user!.sub },
        });
        if (update.count === 0) {
          const existing = await tx.announcementRoute.findUnique({
            where: { id: routeId },
            select: { id: true, status: true },
          });
          if (!existing) {
            throw notFound("Announcement route not found");
          }
          if (existing.status === AnnouncementRouteStatus.archived) {
            throw conflict("Archived routes cannot be modified");
          }
          throw conflict("Route was modified by another user; refresh and try again");
        }

        await tx.routeAudioAssignment.deleteMany({ where: { routeId } });
        if (parsed.data.items.length > 0) {
          await tx.routeAudioAssignment.createMany({
            data: parsed.data.items.map((item, index) => ({
              routeId,
              audioId: item.audioId,
              position: index + 1,
              stopLabel: item.stopLabel,
            })),
          });
        }
        return tx.announcementRoute.findUniqueOrThrow({
          where: { id: routeId },
          select: routeDetailSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    res.status(200).json({ success: true, data: serializeRoute(route) });
  }),
);

announcementRoutesRouter.delete(
  "/routes/:routeId",
  requirePermission(routePermission("delete")),
  asyncHandler(async (req, res) => {
    const routeId = routeIdFrom(req.params);
    const parsed = z.object({ expectedVersion: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("expectedVersion is required", { issues: parsed.error.issues });
    }
    const result = await prisma.announcementRoute.updateMany({
      where: { id: routeId, version: parsed.data.expectedVersion },
      data: {
        status: AnnouncementRouteStatus.archived,
        version: { increment: 1 },
        updatedById: req.user!.sub,
      },
    });
    if (result.count === 0) {
      const exists = await prisma.announcementRoute.findUnique({
        where: { id: routeId },
        select: { id: true },
      });
      if (!exists) {
        throw notFound("Announcement route not found");
      }
      throw conflict("Route was modified by another user; refresh and try again");
    }
    res.status(200).json({ success: true, data: { id: routeId } });
  }),
);

export { announcementRoutesRouter };
