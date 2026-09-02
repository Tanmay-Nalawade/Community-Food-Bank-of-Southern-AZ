const express = require("express");
const router = express.Router();
const { wrapControllerAsync } = require("../utils/asyncHandler");
const vehiclesController = wrapControllerAsync(require("../controllers/vehicleController"));

router.get("/", vehiclesController.index);

router.get("/:id", vehiclesController.viewVehicle);

module.exports = router;
