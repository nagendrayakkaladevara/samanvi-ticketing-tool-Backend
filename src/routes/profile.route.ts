import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { issueAccessToken } from "../auth/auth.service";
import { hashPassword, verifyPassword } from "../auth/password";
import { getRoleLabel, type RoleCode } from "../auth/roles";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, unauthorized } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { toUserUniqueConflictError } from "../lib/prisma-user-unique";
import { requireAuth } from "../middleware/auth";

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(150).nullable().optional(),
    password: z.string().min(6).max(128).optional(),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.email !== undefined ||
      value.password !== undefined,
    { message: "At least one updatable field must be provided" },
  )
  .superRefine((value, ctx) => {
    if (value.password !== undefined && value.currentPassword === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "currentPassword is required when changing password",
        path: ["currentPassword"],
      });
    }
  });

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  isActive: true,
  role: {
    select: {
      code: true,
      label: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get(
  "/profile",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: userSelect,
    });

    if (!user || !user.isActive) {
      throw unauthorized("Authentication required");
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  }),
);

profileRouter.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized("Authentication required");
    }

    const parsedBody = updateProfileSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid profile payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true,
        displayName: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!existing || !existing.isActive) {
      throw unauthorized("Authentication required");
    }

    if (parsedBody.data.password !== undefined) {
      const current = parsedBody.data.currentPassword;
      if (!current) {
        throw badRequest("currentPassword is required when changing password");
      }
      if (!(await verifyPassword(current, existing.passwordHash))) {
        throw unauthorized("Current password is incorrect");
      }
    }

    const displayNameWillChange =
      parsedBody.data.displayName !== undefined &&
      parsedBody.data.displayName !== existing.displayName;

    try {
      const user = await prisma.user.update({
        where: { id: req.user.sub },
        data: {
          ...(parsedBody.data.displayName !== undefined
            ? { displayName: parsedBody.data.displayName }
            : {}),
          ...(parsedBody.data.email !== undefined
            ? { email: parsedBody.data.email }
            : {}),
          ...(parsedBody.data.password !== undefined
            ? { passwordHash: await hashPassword(parsedBody.data.password) }
            : {}),
        },
        select: userSelect,
      });

      const payload: Record<string, unknown> = {
        success: true,
        data: user,
      };

      if (displayNameWillChange) {
        const roleCode = user.role.code as RoleCode;
        payload.accessToken = issueAccessToken({
          id: user.id,
          username: user.username,
          roleCode,
          roleLabel: user.role.label ?? getRoleLabel(roleCode),
          displayName: user.displayName,
        });
      }

      res.status(200).json(payload);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const formattedError = toUserUniqueConflictError(error);
        if (formattedError) {
          throw formattedError;
        }
      }
      throw error;
    }
  }),
);

export { profileRouter };
