const express = require("express");
const router = express.Router();
const { requireITAdmin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const { validateIdParams } = require("../middleware/validate");
const itUserController = wrapControllerAsync(require("../controllers/it/user"));
const itActivityController = wrapControllerAsync(require("../controllers/it/activity"));
const itApiStatusController = wrapControllerAsync(require("../controllers/it/apiStatus"));
const itNotificationController = wrapControllerAsync(require("../controllers/it/notificationSettings"));

validateIdParams(router, ["id"]);

router.get("/users", requireITAdmin, itUserController.index);
router.get("/users/more", requireITAdmin, itUserController.more);
router.get("/users/:id/edit", requireITAdmin, itUserController.edit);
router.put("/users/:id", requireITAdmin, itUserController.update);

router.get("/activity", requireITAdmin, itActivityController.index);
router.get("/activity/more", requireITAdmin, itActivityController.more);

router.get("/api-status", requireITAdmin, itApiStatusController.index);
router.post("/api-status/test", requireITAdmin, itApiStatusController.testConnection);
router.post(
  "/api-status/vehicles/check",
  requireITAdmin,
  itApiStatusController.checkVehicleAccess,
);

// Who receives notification emails (e.g. vehicle issue reported).
router.get("/notifications", requireITAdmin, itNotificationController.index);
router.post("/notifications", requireITAdmin, itNotificationController.update);

module.exports = router;
