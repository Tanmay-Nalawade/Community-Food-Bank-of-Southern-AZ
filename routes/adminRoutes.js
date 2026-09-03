const express = require("express");
const router = express.Router();
const { requireAdmin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const { validateBody } = require("../middleware/validate");
const { addVehicleSchema } = require("../validators/vehicleSchemas");
const {
  updateReservationSchema,
  adminNotesSchema,
} = require("../validators/adminReservationSchemas");
const adminController = wrapControllerAsync(require("../controllers/adminController"));
const adminReservationController = wrapControllerAsync(require("../controllers/adminReservationController"));
const adminIssueController = wrapControllerAsync(require("../controllers/adminIssueController"));
const adminVehicleController = wrapControllerAsync(require("../controllers/adminVehicleController"));
const adminDriverController = wrapControllerAsync(require("../controllers/adminDriverController"));
const adminReportController = wrapControllerAsync(require("../controllers/adminReportController"));

router.get("/vehicles", requireAdmin, adminVehicleController.index);
router.get("/vehicles/add", requireAdmin, adminController.getAddVehicle);
router.post(
  "/vehicles/add",
  requireAdmin,
  validateBody(addVehicleSchema, { redirect: "/admin/vehicles/add" }),
  adminController.postAddVehicle,
);
router.get("/vehicles/:id", requireAdmin, adminVehicleController.show);
router.put("/vehicles/:id", requireAdmin, adminVehicleController.update);
router.post(
  "/vehicles/:id/issues",
  requireAdmin,
  adminVehicleController.addIssue,
);
router.post(
  "/vehicles/:id/issues/:issueId/resolve",
  requireAdmin,
  adminVehicleController.resolveIssue,
);

router.get("/drivers", requireAdmin, adminDriverController.index);
router.get("/drivers/:id", requireAdmin, adminDriverController.show);

router.get("/reports", requireAdmin, adminReportController.index);

router.get("/issues", requireAdmin, adminIssueController.index);
router.post(
  "/issues/:vehicleId/:issueId/review",
  requireAdmin,
  adminIssueController.markReviewed,
);
router.post(
  "/issues/:vehicleId/:issueId/dismiss",
  requireAdmin,
  adminIssueController.dismiss,
);

router.get(
  "/reservations",
  requireAdmin,
  adminReservationController.listReservations,
);
router.get(
  "/reservations/history",
  requireAdmin,
  adminReservationController.pastReservations,
);
router.get(
  "/reservations/:id/edit",
  requireAdmin,
  adminReservationController.editReservation,
);
router.get(
  "/reservations/:id",
  requireAdmin,
  adminReservationController.showReservation,
);
router.put(
  "/reservations/:id",
  requireAdmin,
  validateBody(updateReservationSchema, {
    redirect: (req) => `/admin/reservations/${req.params.id}/edit`,
  }),
  adminReservationController.updateReservation,
);
router.post(
  "/reservations/:id/approve",
  requireAdmin,
  adminReservationController.approveReservation,
);
router.post(
  "/reservations/:id/deny",
  requireAdmin,
  validateBody(adminNotesSchema, { redirect: "/admin/reservations" }),
  adminReservationController.denyReservation,
);
router.post(
  "/reservations/:id/cancel",
  requireAdmin,
  adminReservationController.cancelReservation,
);
router.delete(
  "/reservations/:id",
  requireAdmin,
  adminReservationController.deleteReservation,
);

module.exports = router;
