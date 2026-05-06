import { Prisma } from "@prisma/client";
import { conflict } from "../core/errors/http-errors";

export function toUserUniqueConflictError(
  error: Prisma.PrismaClientKnownRequestError,
) {
  if (error.code !== "P2002") {
    return null;
  }

  const target = Array.isArray(error.meta?.["target"])
    ? (error.meta["target"] as string[])
    : [];

  if (target.includes("username")) {
    return conflict("Username already exists");
  }
  if (target.includes("email")) {
    return conflict("Email already exists");
  }
  return conflict("User with provided unique field already exists");
}
