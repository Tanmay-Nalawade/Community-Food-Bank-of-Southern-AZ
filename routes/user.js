const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const { validateBody } = require("../middleware/validate");
const { createAuthRateLimiter } = require("../middleware/rateLimit");
const {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resendVerificationSchema,
  resetPasswordSchema,
} = require("../validators/user");
const users = wrapControllerAsync(require("../controllers/user"));

const forgotPasswordLimiter = createAuthRateLimiter("/forgot-password");
const resendVerificationLimiter = createAuthRateLimiter("/verify-email/pending");

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

router.get("/forgot-password", users.forgotPasswordForm);
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validateBody(forgotPasswordSchema, { redirect: "/forgot-password" }),
  users.forgotPasswordSubmit,
);
router.get("/reset-password/:token", users.resetPasswordForm);
router.post(
  "/reset-password/:token",
  validateBody(resetPasswordSchema, { redirect: (req) => `/reset-password/${req.params.token}` }),
  users.resetPasswordSubmit,
);

router.get("/verify-email/pending", users.verifyEmailPendingForm);
router.post(
  "/verify-email/resend",
  resendVerificationLimiter,
  validateBody(resendVerificationSchema, { redirect: "/verify-email/pending" }),
  users.resendVerification,
);
router.get("/verify-email/:token", users.verifyEmail);

module.exports = router;
