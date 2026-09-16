const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const { validateBody } = require("../middleware/validate");
const { updateProfileSchema, changePasswordSchema } = require("../validators/user");
const accountController = wrapControllerAsync(require("../controllers/account"));

router.get("/edit", requireLogin, accountController.editForm);
router.post(
  "/edit",
  requireLogin,
  validateBody(updateProfileSchema, { redirect: "/account/edit" }),
  accountController.updateProfile,
);
router.post(
  "/change-password",
  requireLogin,
  validateBody(changePasswordSchema, { redirect: "/account/edit" }),
  accountController.changePassword,
);
router.post("/view-as", requireLogin, accountController.switchView);

module.exports = router;
