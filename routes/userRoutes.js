const express = require("express");
const router = express.Router();
const users = require("../controllers/userController");

router.get("/", users.home);

module.exports = router;
