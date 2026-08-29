const express = require("express");
const router = express.Router();
const { verifyKeyCafeWebhook } = require("../middleware/keycafeWebhookAuth");
const webhookController = require("../controllers/webhookController");

router.post(
  "/keycafe",
  express.json(),
  verifyKeyCafeWebhook,
  webhookController.handleKeyCafeEvent,
);

module.exports = router;
