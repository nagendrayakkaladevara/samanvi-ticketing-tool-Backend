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

export function maybeDocsRouter(): Router {
  if (!env.swaggerEnabled) return Router();
  return docsRouter;
}

