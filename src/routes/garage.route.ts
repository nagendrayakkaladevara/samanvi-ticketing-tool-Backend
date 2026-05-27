import { Router } from "express";
import { jobsRouter } from "./garage-jobs.route";
import { repairCategoriesRouter } from "./garage-repair-categories.route";
import { repairPartsRouter } from "./garage-repair-parts.route";

const garageRouter = Router();

garageRouter.use(repairCategoriesRouter);
garageRouter.use(repairPartsRouter);
garageRouter.use(jobsRouter);

export { garageRouter };
