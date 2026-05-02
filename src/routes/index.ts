import { Router } from "express";
import { env } from "../config/env";
import { apiRateLimiter } from "../middleware/rate-limit";
import { accessControlRouter } from "./access-control.route";
import { authRouter } from "./auth.route";
import { maybeDocsRouter } from "./docs.route";
import { healthRouter } from "./health.route";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use(maybeDocsRouter());
apiRouter.use(accessControlRouter);

const rootRouter = Router();
rootRouter.use(env.apiPrefix, apiRateLimiter, apiRouter);

export { rootRouter };
