import { Router } from "express";
import {
  authenticateDemoUser,
  issueAccessToken,
} from "../auth/auth.service";
import { badRequest, unauthorized } from "../core/errors/http-errors";
import { requireAuth } from "../middleware/auth";

const authRouter = Router();

authRouter.post("/login", (req, res, next) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    next(badRequest("username and password are required"));
    return;
  }

  const user = authenticateDemoUser(username, password);
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
});

authRouter.get("/me", requireAuth, (req, res, next) => {
  if (!req.user) {
    next(unauthorized("Authentication required"));
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

export { authRouter };
