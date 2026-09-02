const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const reservationController = wrapControllerAsync(require("../controllers/reservationController"));

router.get("/mine", requireLogin, reservationController.mine);
router.post(
  "/vehicles/:vehicleId",
  requireLogin,
  reservationController.createRequest,
);

router.get("/:id/edit", requireLogin, reservationController.editForm);
router.put("/:id", requireLogin, reservationController.updateRequest);
router.post("/:id/cancel", requireLogin, reservationController.cancelRequest);

router.get("/:id/mileage", requireLogin, reservationController.mileageForm);
router.post("/:id/mileage", requireLogin, reservationController.submitMileage);

router.get("/:id/issue", requireLogin, reservationController.issueForm);
router.post("/:id/issue", requireLogin, reservationController.submitIssue);

module.exports = router;
