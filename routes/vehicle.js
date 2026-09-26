const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const { validateIdParams } = require("../middleware/validate");
const vehiclesController = wrapControllerAsync(require("../controllers/vehicle"));

validateIdParams(router, ["id"]);

router.get("/", requireLogin, vehiclesController.index);

router.get("/all", requireLogin, vehiclesController.all);

router.get("/:id", requireLogin, vehiclesController.viewVehicle);

module.exports = router;
