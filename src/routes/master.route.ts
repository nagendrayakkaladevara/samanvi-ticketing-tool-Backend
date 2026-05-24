import { Router } from "express";
import { busesRouter } from "./buses.route";
import { driversRouter } from "./drivers.route";
import { helpersRouter } from "./helpers.route";
import { officeStaffRouter } from "./office-staff.route";
import { serviceForRouter } from "./service-for.route";
import { serviceNumbersRouter } from "./service-numbers.route";
import { spareTanksRouter } from "./spare-tanks.route";

const masterRouter = Router();

masterRouter.use(busesRouter);
masterRouter.use(serviceForRouter);
masterRouter.use(spareTanksRouter);
masterRouter.use(serviceNumbersRouter);
masterRouter.use(driversRouter);
masterRouter.use(helpersRouter);
masterRouter.use(officeStaffRouter);

export { masterRouter };
