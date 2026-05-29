const express = require("express");
const router = express.Router();
const vehicles = require("../controllers/vehicleController");

router.get("/", vehicles.index);

module.exports = router;
