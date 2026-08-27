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

module.exports = router;
