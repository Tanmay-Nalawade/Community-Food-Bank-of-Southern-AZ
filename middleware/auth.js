const User = require("../models/user");

const ALLOWED_VIEW_AS = {
  "IT Admin": ["Admin", "Staff"],
  Admin: ["Staff"],
  Staff: [],
};

function landingPathForRole(role) {
  if (role === "Admin") {
    return "/admin/reservations";
  }
  if (role === "IT Admin") {
    return "/it/users";
  }
  return "/";
}

async function loadCurrentUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.viewAsRole = null;
  res.locals.effectiveRole = null;

  if (!req.session.userId) {
    return next();
  }

  const user = await User.findById(req.session.userId);
  if (!user || !user.isActive) {
    req.session.userId = null;
    return next();
  }

  res.locals.currentUser = user;

  const allowedViewAs = ALLOWED_VIEW_AS[user.role] || [];
  let viewAsRole = req.session.viewAsRole || null;

  if (viewAsRole && !allowedViewAs.includes(viewAsRole)) {
    viewAsRole = null;
    req.session.viewAsRole = null;
  }

  res.locals.viewAsRole = viewAsRole;
  res.locals.effectiveRole = viewAsRole || user.role;

  next();
}

function requireLogin(req, res, next) {
  if (!res.locals.currentUser) {
    req.session.returnTo = req.originalUrl;
    return res.redirect("/login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.currentUser || res.locals.effectiveRole !== "Admin") {
    return res.status(403).send("Admin access required.");
  }
  next();
}

function requireITAdmin(req, res, next) {
  if (!res.locals.currentUser || res.locals.effectiveRole !== "IT Admin") {
    return res.status(403).send("IT Administrator access required.");
  }
  next();
}

module.exports = {
  loadCurrentUser,
  requireLogin,
  requireAdmin,
  requireITAdmin,
  ALLOWED_VIEW_AS,
  landingPathForRole,
};
