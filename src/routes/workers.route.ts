import { RoleCode } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../core/http/async-handler";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const workersRouter = Router();

workersRouter.use(requireAuth, requireFeature("assign_ticket"));

workersRouter.get(
  "/workers",
  asyncHandler(async (_req, res) => {
    const workers = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { code: RoleCode.worker },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
      orderBy: { displayName: "asc" },
    });

    res.status(200).json({
      success: true,
      data: {
        items: workers,
      },
    });
  }),
);

export { workersRouter };
