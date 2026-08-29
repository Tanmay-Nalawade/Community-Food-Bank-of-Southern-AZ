const express = require("express");
const router = express.Router();
const { requireITAdmin } = require("../middleware/auth");
const itUserController = require("../controllers/itUserController");
const itActivityController = require("../controllers/itActivityController");
const itApiStatusController = require("../controllers/itApiStatusController");

router.get("/users", requireITAdmin, itUserController.index);
router.get("/users/:id/edit", requireITAdmin, itUserController.edit);
router.put("/users/:id", requireITAdmin, itUserController.update);

router.get("/activity", requireITAdmin, itActivityController.index);

router.get("/api-status", requireITAdmin, itApiStatusController.index);
router.post("/api-status/test", requireITAdmin, itApiStatusController.testConnection);

module.exports = router;
