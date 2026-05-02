import { Router } from "express";
import { env } from "../config/env";

const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service: "ticketing-api",
      env: env.nodeEnv,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

export { healthRouter };
