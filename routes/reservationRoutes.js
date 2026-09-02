const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { wrapControllerAsync } = require("../utils/asyncHandler");
const { validateBody } = require("../middleware/validate");
const {
  bookingWindowSchema,
  mileageSchema,
  issueSchema,
} = require("../validators/reservationSchemas");
const reservationController = wrapControllerAsync(require("../controllers/reservationController"));

router.get("/mine", requireLogin, reservationController.mine);
router.post(
  "/vehicles/:vehicleId",
  requireLogin,
  validateBody(bookingWindowSchema, {
    redirect: (req) => `/vehicles/${req.params.vehicleId}`,
  }),
  reservationController.createRequest,
);

router.get("/:id/edit", requireLogin, reservationController.editForm);
router.put(
  "/:id",
  requireLogin,
  validateBody(bookingWindowSchema, {
    redirect: (req) => `/reservations/${req.params.id}/edit`,
  }),
  reservationController.updateRequest,
);
router.post("/:id/cancel", requireLogin, reservationController.cancelRequest);

router.get("/:id/mileage", requireLogin, reservationController.mileageForm);
router.post(
  "/:id/mileage",
  requireLogin,
  validateBody(mileageSchema, {
    redirect: (req) => `/reservations/${req.params.id}/mileage`,
  }),
  reservationController.submitMileage,
);

router.get("/:id/issue", requireLogin, reservationController.issueForm);
router.post(
  "/:id/issue",
  requireLogin,
  validateBody(issueSchema, {
    redirect: (req) => `/reservations/${req.params.id}/issue`,
  }),
  reservationController.submitIssue,
);

module.exports = router;
