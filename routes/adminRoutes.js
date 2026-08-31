const express = require("express");
const router = express.Router();
const { requireAdmin } = require("../middleware/auth");
const adminController = require("../controllers/adminController");
const adminReservationController = require("../controllers/adminReservationController");
const adminVehicleController = require("../controllers/adminVehicleController");
const adminDriverController = require("../controllers/adminDriverController");
const adminReportController = require("../controllers/adminReportController");

router.get("/vehicles", requireAdmin, adminVehicleController.index);
router.get("/vehicles/add", requireAdmin, adminController.getAddVehicle);
router.post("/vehicles/add", requireAdmin, adminController.postAddVehicle);
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
