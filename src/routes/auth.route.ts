import { Router } from "express";
import {
  authenticateUser,
  issueAccessToken,
} from "../auth/auth.service";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, unauthorized } from "../core/errors/http-errors";
import { getUserEffectivePermissions } from "../lib/permissions";
import { requireAuth } from "../middleware/auth";

const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res, next) => {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      next(badRequest("username and password are required"));
      return;
    }

    const user = await authenticateUser(username, password);
    if (!user) {
      next(unauthorized("Invalid username or password"));
      return;
    }

    const accessToken = issueAccessToken(user);
    res.status(200).json({
      success: true,
      data: {
        accessToken,
        tokenType: "Bearer",
        expiresIn: "See JWT exp claim",
        user,
      },
    });
  }),
);

authRouter.get("/me", requireAuth, asyncHandler(async (req, res, next) => {
  if (!req.user) {
    next(unauthorized("Authentication required"));
    return;
  }

  const permissions = await getUserEffectivePermissions(
    req.user.sub,
    req.user.roleCode,
  );

  res.status(200).json({
    success: true,
    data: {
      user: {
        ...req.user,
        permissions,
      },
    },
  });
}));

export { authRouter };
