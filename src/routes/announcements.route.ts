import { Router } from "express";
import { announcementAudiosRouter } from "./announcement-audios.route";
import { announcementRoutesRouter } from "./announcement-routes.route";
import { announcementSettingsRouter } from "./announcement-settings.route";
import { mobileDriverUsersRouter } from "./mobile-driver-users.route";

const announcementsRouter = Router();
announcementsRouter.use(announcementAudiosRouter);
announcementsRouter.use(announcementRoutesRouter);
announcementsRouter.use(announcementSettingsRouter);
announcementsRouter.use(mobileDriverUsersRouter);

export { announcementsRouter };
