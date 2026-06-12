const express = require("express");
const router = express.Router();
const vehiclesController = require("../controllers/vehicleController");

router.get("/", vehiclesController.index);
router.get("/add", vehiclesController.getAddVehicle);
router.post("/add", vehiclesController.postAddVehicle);

module.exports = router;
