const express = require("express");
const router = express.Router();
const vehiclesController = require("../controllers/vehicleController");

router.get("/", vehiclesController.index);

router.get("/add", vehiclesController.getAddVehicle);

module.exports = router;
