import type { RequestHandler } from "express";
import { verifyAccessToken } from "../auth/auth.service";
import { canAccessFeature, type Feature } from "../auth/roles";
import { forbidden, unauthorized } from "../core/errors/http-errors";

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

  req.user = verifyAccessToken(token);
  next();
};

export function requireFeature(feature: Feature): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(unauthorized("Authentication required"));
      return;
    }

    if (!canAccessFeature(req.user.roleCode, feature)) {
      next(forbidden("You are not allowed to perform this action"));
      return;
    }

    next();
  };
}
