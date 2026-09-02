const express = require("express");
const router = express.Router();
const { requireAdmin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const adminController = wrapControllerAsync(require("../controllers/adminController"));
const adminReservationController = wrapControllerAsync(require("../controllers/adminReservationController"));
const adminIssueController = wrapControllerAsync(require("../controllers/adminIssueController"));

router.get("/vehicles/add", requireAdmin, adminController.getAddVehicle);
router.post("/vehicles/add", requireAdmin, adminController.postAddVehicle);

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
  "/reservations/:id/edit",
  requireAdmin,
  adminReservationController.editReservation,
);
router.put(
  "/reservations/:id",
  requireAdmin,
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
  adminReservationController.denyReservation,
);
router.delete(
  "/reservations/:id",
  requireAdmin,
  adminReservationController.deleteReservation,
);

module.exports = router;
