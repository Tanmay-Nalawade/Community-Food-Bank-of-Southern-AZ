const { renderError } = require("../utils/httpError");

const ALLOWED_VIEW_AS = {
  "IT Admin": ["Admin", "Staff"],
  Admin: ["Staff"],
  Staff: [],
};

function landingPathForRole(role) {
  if (role === "Admin") {
    return "/admin/dashboard";
  }
  if (role === "IT Admin") {
    return "/it/users";
  }
  return "/";
}

// Runs after res.locals.currentUser has been set from req.user (see app.js).
// Computes the "view as" override on top of the real, Passport-authenticated
// user, rather than re-fetching the user from the session directly.
function computeEffectiveRole(req, res, next) {
  res.locals.viewAsRole = null;
  res.locals.effectiveRole = null;

  const user = res.locals.currentUser;
  if (!user) {
    return next();
  }

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
    req.flash("error", "Please log in first.");
    return res.redirect("/login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.currentUser || res.locals.effectiveRole !== "Admin") {
    return renderError(res, 403, "Admin access required.");
  }
  next();
}

function requireITAdmin(req, res, next) {
  if (!res.locals.currentUser || res.locals.effectiveRole !== "IT Admin") {
    return renderError(res, 403, "IT Administrator access required.");
  }
  next();
}

module.exports = {
  computeEffectiveRole,
  requireLogin,
  requireAdmin,
  requireITAdmin,
  ALLOWED_VIEW_AS,
  landingPathForRole,
};
