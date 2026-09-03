const ActivityLog = require("../models/activityLog");
const { ALLOWED_VIEW_AS, landingPathForRole } = require("../middleware/auth");

exports.switchView = async (req, res) => {
  const currentUser = res.locals.currentUser;
  const targetRole = req.body.role || "";

  if (!targetRole) {
    const fromRole = res.locals.effectiveRole;
    req.session.viewAsRole = null;

    if (fromRole !== currentUser.role) {
      await ActivityLog.create({
        userId: currentUser._id,
        action: "RoleSwitch",
        detail: `Returned to ${currentUser.role} view from ${fromRole} view`,
      });
    }

    req.flash("success", `Back to your ${currentUser.role} view.`);
    return res.redirect(landingPathForRole(currentUser.role));
  }

  const allowedViewAs = ALLOWED_VIEW_AS[currentUser.role] || [];

  if (!allowedViewAs.includes(targetRole)) {
    req.flash("error", "You can't switch to that view.");
    return res.redirect("/");
  }

  req.session.viewAsRole = targetRole;

  await ActivityLog.create({
    userId: currentUser._id,
    action: "RoleSwitch",
    detail: `Switched to ${targetRole} view`,
  });

  req.flash("success", `Now viewing as ${targetRole}.`);
  res.redirect(landingPathForRole(targetRole));
};
