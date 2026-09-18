const ActivityLog = require("../models/activityLog");
const User = require("../models/user");
const { ALLOWED_VIEW_AS, landingPathForRole } = require("../middleware/auth");

exports.editForm = (req, res) => {
  res.render("account/edit", { title: "My Account" });
};

exports.updateProfile = async (req, res) => {
  const { firstName, lastName } = req.body;
  const email = (req.body.email || "").trim().toLowerCase();
  const currentUser = res.locals.currentUser;

  const existing = await User.findOne({ email, _id: { $ne: currentUser._id } });
  if (existing) {
    req.flash("error", "That email is already in use by another account.");
    return res.redirect("/account/edit");
  }

  const user = await User.findById(currentUser._id);
  user.firstName = firstName;
  user.lastName = lastName;
  user.email = email;

  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000) {
      req.flash("error", "That email is already in use by another account.");
      return res.redirect("/account/edit");
    }
    throw error;
  }

  req.flash("success", "Your account details have been updated.");
  res.redirect("/account/edit");
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(res.locals.currentUser._id);

  try {
    await user.changePassword(currentPassword, newPassword);
  } catch (err) {
    req.flash("error", "Your current password was incorrect.");
    return res.redirect("/account/edit");
  }

  req.flash("success", "Your password has been changed.");
  res.redirect("/account/edit");
};

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
