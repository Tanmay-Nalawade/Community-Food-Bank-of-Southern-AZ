const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const reservationController = require("../controllers/reservationController");

router.get("/mine", requireLogin, reservationController.mine);
router.post(
  "/vehicles/:vehicleId",
  requireLogin,
  reservationController.createRequest,
);

router.get("/:id/edit", requireLogin, reservationController.editForm);
router.put("/:id", requireLogin, reservationController.updateRequest);
router.post("/:id/cancel", requireLogin, reservationController.cancelRequest);

module.exports = router;
