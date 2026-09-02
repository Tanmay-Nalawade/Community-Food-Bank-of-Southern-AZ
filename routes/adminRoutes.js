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

router.get("/vehicles/add", requireAdmin, adminController.getAddVehicle);
router.post(
  "/vehicles/add",
  requireAdmin,
  validateBody(addVehicleSchema, { redirect: "/admin/vehicles/add" }),
  adminController.postAddVehicle,
);

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
router.delete(
  "/reservations/:id",
  requireAdmin,
  adminReservationController.deleteReservation,
);

module.exports = router;
