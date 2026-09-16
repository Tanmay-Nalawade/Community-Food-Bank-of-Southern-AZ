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
const adminDashboardController = wrapControllerAsync(require("../controllers/adminDashboardController"));
const adminReservationController = wrapControllerAsync(require("../controllers/adminReservationController"));
const adminIssueController = wrapControllerAsync(require("../controllers/adminIssueController"));
const adminVehicleController = wrapControllerAsync(require("../controllers/adminVehicleController"));
const adminDriverController = wrapControllerAsync(require("../controllers/adminDriverController"));
const adminReportController = wrapControllerAsync(require("../controllers/adminReportController"));
const adminMileageLogController = wrapControllerAsync(require("../controllers/adminMileageLogController"));

router.get("/", requireAdmin, (req, res) => res.redirect("/admin/dashboard"));
router.get("/dashboard", requireAdmin, adminDashboardController.index);

router.get("/vehicles", requireAdmin, adminVehicleController.index);
router.get("/vehicles/more", requireAdmin, adminVehicleController.more);
router.get("/vehicles/add", requireAdmin, adminController.getAddVehicle);
router.post(
  "/vehicles/add",
  requireAdmin,
  validateBody(addVehicleSchema, { redirect: "/admin/vehicles/add" }),
  adminController.postAddVehicle,
);
router.get("/vehicles/:id", requireAdmin, adminVehicleController.show);
router.put("/vehicles/:id", requireAdmin, adminVehicleController.update);
router.get(
  "/vehicles/:id/reservations/more",
  requireAdmin,
  adminVehicleController.moreReservations,
);
router.get(
  "/vehicles/:id/mileage-log",
  requireAdmin,
  adminMileageLogController.show,
);
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
router.get("/drivers/more", requireAdmin, adminDriverController.more);
router.get("/drivers/:id", requireAdmin, adminDriverController.show);
router.get(
  "/drivers/:id/reservations/more",
  requireAdmin,
  adminDriverController.moreReservations,
);

router.get("/reports", requireAdmin, adminReportController.index);
router.get("/reports/more", requireAdmin, adminReportController.more);

router.get("/issues", requireAdmin, adminIssueController.index);
router.get("/issues/more", requireAdmin, adminIssueController.more);
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
  "/reservations/more",
  requireAdmin,
  adminReservationController.moreReservations,
);
router.get(
  "/reservations/history",
  requireAdmin,
  adminReservationController.pastReservations,
);
router.get(
  "/reservations/history/more",
  requireAdmin,
  adminReservationController.moreHistory,
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
