const express = require("express");
const router = express.Router();
const users = require("../controllers/userController");

router.get("/", users.home);
router.get("/account", users.account);

module.exports = router;
