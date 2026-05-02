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

accessControlRouter.post("/buses", requireFeature("manage_buses"), (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      message: "Allowed to manage buses",
    },
  });
});

export { accessControlRouter };
