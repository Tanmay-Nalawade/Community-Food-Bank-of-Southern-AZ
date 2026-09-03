const keycafe = require("../services/keycafe");

exports.index = async (req, res) => {
  res.render("it/api-status/index", {
    title: "API Status",
    keycafeConfigured: keycafe.isConfigured(),
    webhookConfigured: Boolean(
      process.env.KEYCAFE_WEBHOOK_USERNAME && process.env.KEYCAFE_WEBHOOK_PASSWORD,
    ),
    keycafeTimezone: process.env.KEYCAFE_TIMEZONE || "America/Phoenix",
    activeNav: "it",
  });
};

exports.testConnection = async (req, res) => {
  const result = await keycafe.testConnection();

  if (result.ok) {
    req.flash("success", `KeyCafe connection succeeded: ${result.detail}`);
  } else {
    req.flash("error", `KeyCafe connection failed: ${result.detail}`);
  }

  res.redirect("/it/api-status");
};
