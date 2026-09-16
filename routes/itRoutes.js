const express = require("express");
const router = express.Router();
const { requireITAdmin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const itUserController = wrapControllerAsync(require("../controllers/itUserController"));
const itActivityController = wrapControllerAsync(require("../controllers/itActivityController"));
const itApiStatusController = wrapControllerAsync(require("../controllers/itApiStatusController"));

router.get("/users", requireITAdmin, itUserController.index);
router.get("/users/more", requireITAdmin, itUserController.more);
router.get("/users/:id/edit", requireITAdmin, itUserController.edit);
router.put("/users/:id", requireITAdmin, itUserController.update);

router.get("/activity", requireITAdmin, itActivityController.index);
router.get("/activity/more", requireITAdmin, itActivityController.more);

router.get("/api-status", requireITAdmin, itApiStatusController.index);
router.post("/api-status/test", requireITAdmin, itApiStatusController.testConnection);

module.exports = router;
