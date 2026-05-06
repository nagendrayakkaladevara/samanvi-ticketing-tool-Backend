import { Router } from "express";
import { env } from "../config/env";
import { apiRateLimiter } from "../middleware/rate-limit";
import { accessControlRouter } from "./access-control.route";
import { aiRouter } from "./ai.route";
import { authRouter } from "./auth.route";
import { busesRouter } from "./buses.route";
import { dashboardRouter } from "./dashboard.route";
import { maybeDocsRouter } from "./docs.route";
import { healthRouter } from "./health.route";
import { issueCategoriesRouter } from "./issue-categories.route";
import { profileRouter } from "./profile.route";
import { successMetricsRouter } from "./success-metrics.route";
import { ticketsRouter } from "./tickets.route";
import { usersRouter } from "./users.route";
import { workersRouter } from "./workers.route";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use(profileRouter);
apiRouter.use(aiRouter);
apiRouter.use(maybeDocsRouter());
apiRouter.use(issueCategoriesRouter);
apiRouter.use(busesRouter);
apiRouter.use(usersRouter);
apiRouter.use(ticketsRouter);
apiRouter.use(workersRouter);
apiRouter.use(dashboardRouter);
apiRouter.use(successMetricsRouter);
apiRouter.use(accessControlRouter);

const rootRouter = Router();
rootRouter.use(env.apiPrefix, apiRateLimiter, apiRouter);

export { rootRouter };
