const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

router.get("/add", adminController.getAddVehicle);
router.post("/add", adminController.postAddVehicle);

module.exports = router;
