const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const tripController = wrapControllerAsync(require("../controllers/trip"));

// Staff "Log a past trip": submitted for an admin to review.
router.get("/new", requireLogin, tripController.newForm);
router.post("/", requireLogin, tripController.create);

module.exports = router;
