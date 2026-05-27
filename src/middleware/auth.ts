import type { RequestHandler } from "express";
import { verifyAccessToken } from "../auth/auth.service";
import { type Feature } from "../auth/roles";
import { forbidden, unauthorized } from "../core/errors/http-errors";
import type { PermissionKey } from "../lib/permission-catalog";
import {
  userHasFeatureAccess,
  userHasPermission,
} from "../lib/permissions";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    next(unauthorized("Missing Authorization header"));
    return;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    next(unauthorized("Authorization header must use Bearer token"));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export function requireFeature(feature: Feature): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      next(unauthorized("Authentication required"));
      return;
    }

    try {
      const allowed = await userHasFeatureAccess(
        req.user.sub,
        req.user.roleCode,
        feature,
      );
      if (!allowed) {
        next(
          forbidden(
            `You are not allowed to perform this action (requires ${feature})`,
          ),
        );
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(required: PermissionKey): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      next(unauthorized("Authentication required"));
      return;
    }

    try {
      const allowed = await userHasPermission(
        req.user.sub,
        req.user.roleCode,
        required,
      );
      if (!allowed) {
        next(
          forbidden(
            `You are not allowed to perform this action (requires ${required.module}/${required.submodule}/${required.action})`,
          ),
        );
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
