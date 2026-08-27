const express = require("express");
const router = express.Router();
const users = require("../controllers/userController");

router.get("/", users.home);
router.get("/login", users.login);
router.post("/login", users.login);
router.get("/register", users.register);
router.post("/register", users.register);
router.post("/logout", users.logout);

module.exports = router;
