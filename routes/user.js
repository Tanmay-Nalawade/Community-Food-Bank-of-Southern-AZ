const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const { validateBody } = require("../middleware/validate");
const { loginSchema, registerSchema } = require("../validators/user");
const users = wrapControllerAsync(require("../controllers/user"));

router.get("/", requireLogin, users.home);
router.get("/login", users.login);
router.post("/login", validateBody(loginSchema, { redirect: "/login" }), users.login);
router.get("/register", users.register);
router.post(
  "/register",
  validateBody(registerSchema, { redirect: "/register" }),
  users.register,
);
router.post("/logout", users.logout);

module.exports = router;
