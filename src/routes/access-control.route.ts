import { Router } from "express";
import { requireAuth, requireFeature } from "../middleware/auth";

const accessControlRouter = Router();

accessControlRouter.use(requireAuth);

accessControlRouter.post(
  "/tickets/:ticketId/assign",
  requireFeature("assign_ticket"),
  (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        message: "Allowed to assign ticket",
        ticketId: req.params.ticketId,
      },
    });
  },
);

accessControlRouter.patch(
  "/tickets/:ticketId/status",
  requireFeature("update_status"),
  (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        message: "Allowed to update ticket status",
        ticketId: req.params.ticketId,
      },
    });
  },
);

accessControlRouter.post("/users", requireFeature("manage_users"), (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      message: "Allowed to manage users",
    },
  });
});

accessControlRouter.post(
  "/issue-categories",
  requireFeature("manage_categories"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        message: "Allowed to manage issue categories",
      },
    });
  },
);

accessControlRouter.post(
  "/master/buses",
  requireFeature("manage_buses"),
  (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      message: "Allowed to manage buses",
    },
  });
  },
);

accessControlRouter.post(
  "/master/service-for",
  requireFeature("manage_master"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      data: { message: "Allowed to manage master data" },
    });
  },
);

accessControlRouter.post("/garage/jobs", requireFeature("create_garage_job"), (_req, res) => {
  res.status(200).json({
    success: true,
    data: { message: "Allowed to create repair jobs" },
  });
});

accessControlRouter.patch(
  "/garage/jobs/:jobId",
  requireFeature("manage_garage_job"),
  (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        message: "Allowed to manage repair jobs",
        jobId: req.params.jobId,
      },
    });
  },
);

accessControlRouter.post(
  "/garage/masters/repair-categories",
  requireFeature("manage_garage_masters"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      data: { message: "Allowed to manage garage masters" },
    });
  },
);

export { accessControlRouter };
