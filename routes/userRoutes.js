const express = require("express");
const router = express.Router();
const { wrapControllerAsync } = require("../utils/asyncHandler");
const { validateBody } = require("../middleware/validate");
const { loginSchema, registerSchema } = require("../validators/userSchemas");
const users = wrapControllerAsync(require("../controllers/userController"));

router.get("/", users.home);
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
