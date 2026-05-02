import { Router } from "express";
import { requireAuth, requireFeature } from "../middleware/auth";

const accessControlRouter = Router();

accessControlRouter.use(requireAuth);

accessControlRouter.post(
  "/tickets",
  requireFeature("create_ticket"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        message: "Allowed to create ticket",
      },
    });
  },
);

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

accessControlRouter.get(
  "/dashboard",
  requireFeature("view_dashboard"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        message: "Allowed to view dashboard",
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

export { accessControlRouter };
