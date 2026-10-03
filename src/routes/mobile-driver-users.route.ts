import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "../auth/password";
import { normalizeMobileUsername } from "../auth/mobile-auth.service";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";

const usernameSchema = z.string().trim().min(3).max(50).transform(normalizeMobileUsername);
const passwordSchema = z.string().min(10).max(128);

const createSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(100),
  driverId: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  driverId: z.string().trim().min(1).nullable().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "At least one field must be provided",
});

const statusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["all", "active", "inactive", "deleted"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const mobileUserSelect = {
  id: true,
  username: true,
  displayName: true,
  driverId: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  driver: { select: { id: true, driverIdNumber: true, aadharName: true, mobileNumber: true } },
  device: {
    select: {
      platform: true,
      deviceName: true,
      osVersion: true,
      appVersion: true,
      registeredAt: true,
      lastSeenAt: true,
    },
  },
} satisfies Prisma.MobileDriverUserSelect;

function userIdFrom(value: string | string[] | undefined): string {
  if (!value || Array.isArray(value)) throw badRequest("Invalid mobile user id");
  return value;
}

async function ensureDriverAvailable(driverId: string, excludeUserId?: string) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } });
  if (!driver) throw badRequest("Selected driver does not exist");
  const linked = await prisma.mobileDriverUser.findFirst({
    where: { driverId, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  if (linked) throw conflict("Selected driver already has a mobile account");
}

function rethrowUnique(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw conflict("Username or driver is already assigned to another mobile account");
  }
  throw error;
}

const mobileDriverUsersRouter = Router();
mobileDriverUsersRouter.use(requireAuth);

mobileDriverUsersRouter.get(
  "/mobile-users",
  requirePermission({ module: "announcements", submodule: "mobile_users", action: "view" }),
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) throw badRequest("Invalid mobile user query", { issues: parsed.error.issues });
    const { search, status, page, limit } = parsed.data;
    const where: Prisma.MobileDriverUserWhereInput = {
      ...(status === "deleted" ? { deletedAt: { not: null } } : { deletedAt: null }),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
      ...(search ? {
        OR: [
          { username: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } },
          { driver: { driverIdNumber: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    };
    const [total, items] = await prisma.$transaction([
      prisma.mobileDriverUser.count({ where }),
      prisma.mobileDriverUser.findMany({
        where,
        select: mobileUserSelect,
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      success: true,
      data: { items },
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  }),
);

mobileDriverUsersRouter.get(
  "/mobile-users/:userId",
  requirePermission({ module: "announcements", submodule: "mobile_users", action: "view" }),
  asyncHandler(async (req, res) => {
    const user = await prisma.mobileDriverUser.findUnique({
      where: { id: userIdFrom(req.params.userId) },
      select: mobileUserSelect,
    });
    if (!user) throw notFound("Mobile driver account not found");
    res.status(200).json({ success: true, data: user });
  }),
);

mobileDriverUsersRouter.post(
  "/mobile-users",
  requirePermission({ module: "announcements", submodule: "mobile_users", action: "create" }),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid mobile user payload", { issues: parsed.error.issues });
    if (parsed.data.driverId) await ensureDriverAvailable(parsed.data.driverId);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.mobileDriverUser.create({
          data: {
            username: parsed.data.username,
            passwordHash: await hashPassword(parsed.data.password),
            displayName: parsed.data.displayName,
            driverId: parsed.data.driverId,
            isActive: parsed.data.isActive ?? true,
            createdByAdminId: req.user!.sub,
          },
          select: mobileUserSelect,
        });
        await tx.mobileDriverAuthAudit.create({
          data: { userId: user.id, adminActorId: req.user!.sub, eventType: "ACCOUNT_CREATED", requestId: req.requestId },
        });
        return user;
      });
      res.status(201).json({ success: true, data: created });
    } catch (error) {
      rethrowUnique(error);
    }
  }),
);

mobileDriverUsersRouter.patch(
  "/mobile-users/:userId",
  requirePermission({ module: "announcements", submodule: "mobile_users", action: "edit" }),
  asyncHandler(async (req, res) => {
    const userId = userIdFrom(req.params.userId);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid mobile user payload", { issues: parsed.error.issues });
    const existing = await prisma.mobileDriverUser.findFirst({ where: { id: userId, deletedAt: null } });
    if (!existing) throw notFound("Mobile driver account not found");
    if (parsed.data.driverId) await ensureDriverAvailable(parsed.data.driverId, userId);
    const now = new Date();
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.mobileDriverUser.update({
          where: { id: userId },
          data: {
            ...(parsed.data.username !== undefined ? { username: parsed.data.username } : {}),
            ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
            ...(parsed.data.driverId !== undefined ? { driverId: parsed.data.driverId } : {}),
            ...(parsed.data.password !== undefined ? { passwordHash: await hashPassword(parsed.data.password) } : {}),
          },
          select: mobileUserSelect,
        });
        if (parsed.data.password !== undefined) {
          await tx.mobileDriverSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now, revocationReason: "PASSWORD_CHANGED" },
          });
        }
        await tx.mobileDriverAuthAudit.create({
          data: {
            userId,
            adminActorId: req.user!.sub,
            eventType: parsed.data.password !== undefined ? "PASSWORD_CHANGED" : "ACCOUNT_UPDATED",
            requestId: req.requestId,
          },
        });
        return user;
      });
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      rethrowUnique(error);
    }
  }),
);

mobileDriverUsersRouter.patch(
  "/mobile-users/:userId/status",
  requirePermission({ module: "announcements", submodule: "mobile_users", action: "change_status" }),
  asyncHandler(async (req, res) => {
    const userId = userIdFrom(req.params.userId);
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Status and reason are required", { issues: parsed.error.issues });
    const existing = await prisma.mobileDriverUser.findFirst({ where: { id: userId, deletedAt: null } });
    if (!existing) throw notFound("Mobile driver account not found");
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.mobileDriverUser.update({
        where: { id: userId }, data: { isActive: parsed.data.isActive }, select: mobileUserSelect,
      });
      if (!parsed.data.isActive) {
        await tx.mobileDriverSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now, revocationReason: "ACCOUNT_DEACTIVATED" },
        });
      }
      await tx.mobileDriverAuthAudit.create({
        data: {
          userId,
          adminActorId: req.user!.sub,
          eventType: parsed.data.isActive ? "ACCOUNT_ACTIVATED" : "ACCOUNT_DEACTIVATED",
          reason: parsed.data.reason,
          requestId: req.requestId,
        },
      });
      return user;
    });
    res.status(200).json({ success: true, data: updated });
  }),
);

mobileDriverUsersRouter.post(
  "/mobile-users/:userId/reset-device",
  requirePermission({ module: "announcements", submodule: "mobile_users", action: "reset_device" }),
  asyncHandler(async (req, res) => {
    const userId = userIdFrom(req.params.userId);
    const parsed = reasonSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("A reset reason is required", { issues: parsed.error.issues });
    const existing = await prisma.mobileDriverUser.findFirst({ where: { id: userId, deletedAt: null } });
    if (!existing) throw notFound("Mobile driver account not found");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.mobileDriverSession.updateMany({
        where: { userId, revokedAt: null }, data: { revokedAt: now, revocationReason: "DEVICE_RESET" },
      });
      await tx.mobileDriverDevice.deleteMany({ where: { userId } });
      await tx.mobileDriverAuthAudit.create({
        data: { userId, adminActorId: req.user!.sub, eventType: "DEVICE_RESET", reason: parsed.data.reason, requestId: req.requestId },
      });
    });
    res.status(200).json({ success: true, data: { id: userId, deviceReset: true } });
  }),
);

mobileDriverUsersRouter.delete(
  "/mobile-users/:userId",
  requirePermission({ module: "announcements", submodule: "mobile_users", action: "delete" }),
  asyncHandler(async (req, res) => {
    const userId = userIdFrom(req.params.userId);
    const parsed = reasonSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("A deletion reason is required", { issues: parsed.error.issues });
    const existing = await prisma.mobileDriverUser.findFirst({ where: { id: userId, deletedAt: null } });
    if (!existing) throw notFound("Mobile driver account not found");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.mobileDriverSession.updateMany({
        where: { userId, revokedAt: null }, data: { revokedAt: now, revocationReason: "ACCOUNT_DELETED" },
      });
      await tx.mobileDriverDevice.deleteMany({ where: { userId } });
      await tx.mobileDriverUser.update({ where: { id: userId }, data: { isActive: false, deletedAt: now } });
      await tx.mobileDriverAuthAudit.create({
        data: { userId, adminActorId: req.user!.sub, eventType: "ACCOUNT_DELETED", reason: parsed.data.reason, requestId: req.requestId },
      });
    });
    res.status(200).json({ success: true, data: { id: userId, deleted: true } });
  }),
);

export { mobileDriverUsersRouter };
