const {
  TYPE_KEYS,
  parseRecipients,
  listSettings,
  setRecipients,
} = require("../../services/notificationSettings");
const { isConfigured: isEmailConfigured } = require("../../services/email");

async function renderPage(res, { status = 200, drafts = {} } = {}) {
  res.status(status).render("it/notifications/index", {
    title: "Notification Emails",
    // Not `settings` — Express reserves that local for app settings, and
    // ejs-mate reads the views directory from it.
    notificationTypes: await listSettings(),
    drafts,
    emailConfigured: isEmailConfigured(),
    activeNav: "it-notifications",
  });
}

exports.index = async (req, res) => {
  await renderPage(res);
};

// One form per notification type; each posts its own `type` + `recipients`.
exports.update = async (req, res) => {
  const type = typeof req.body.type === "string" ? req.body.type : "";
  if (!TYPE_KEYS.includes(type)) {
    req.flash("error", "Unknown notification type.");
    return res.redirect("/it/notifications");
  }

  const { list, error } = parseRecipients(req.body.recipients);
  if (error) {
    res.locals.errorMessages = [error];
    // Re-show what was typed so the admin can fix the one bad address.
    return renderPage(res, { status: 400, drafts: { [type]: String(req.body.recipients || "") } });
  }

  await setRecipients(type, list, res.locals.currentUser.id);

  req.flash(
    "success",
    list.length
      ? `Saved — these notifications will go to ${list.join(", ")}.`
      : "Saved — nobody will be emailed for this notification.",
  );
  res.redirect("/it/notifications");
};
