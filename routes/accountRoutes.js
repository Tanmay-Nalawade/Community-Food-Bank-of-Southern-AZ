const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const accountController = require("../controllers/accountController");

router.post("/view-as", requireLogin, accountController.switchView);

module.exports = router;
