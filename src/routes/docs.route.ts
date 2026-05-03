import type { Request, Response } from "express";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "../config/env";
import { buildOpenApiSpec } from "../docs/openapi";

const docsRouter = Router();

docsRouter.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApiSpec());
});

docsRouter.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(buildOpenApiSpec(), {
    swaggerOptions: {
      persistAuthorization: true,
    },
  }),
);

/** When Swagger is off, still register these paths so requests do not fall through to `requireAuth` on other routers. */
const swaggerDisabledRouter = Router();

function swaggerDisabledResponse(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message:
        "API documentation is disabled. Set SWAGGER_ENABLED=true in the server environment to enable Swagger UI.",
    },
    requestId: req.requestId,
  });
}

swaggerDisabledRouter.get("/openapi.json", swaggerDisabledResponse);
swaggerDisabledRouter.use("/docs", swaggerDisabledResponse);

export function maybeDocsRouter(): Router {
  if (!env.swaggerEnabled) {
    return swaggerDisabledRouter;
  }
  return docsRouter;
}

