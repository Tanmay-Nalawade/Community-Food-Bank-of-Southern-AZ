const { renderError } = require("../utils/httpError");

// Roles are cumulative: an Admin can do everything Staff can, and an IT Admin
// everything an Admin (and so Staff) can. Checks compare ranks rather than
// matching one exact role, so a higher role is never locked out of a lower
// role's features.
const ROLE_RANK = {
  Staff: 1,
  Admin: 2,
  "IT Admin": 3,
};

function hasRole(role, minimumRole) {
  return (ROLE_RANK[role] || 0) >= ROLE_RANK[minimumRole];
}

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

// GET requests (page views) check the effective (possibly view-as) role, so
// "view as" shows exactly that role's screens. State-changing requests check
// the REAL underlying role, so "view as" can never grant a role more than it
// genuinely has: an IT Admin viewing as Admin can approve/deny/delete like an
// Admin (IT Admin includes Admin — see ROLE_RANK), but an Admin can never
// perform IT Admin actions.
function roleForCheck(req, res) {
  return req.method === "GET" ? res.locals.effectiveRole : res.locals.currentUser.role;
}

function requireAdmin(req, res, next) {
  if (!res.locals.currentUser || !hasRole(roleForCheck(req, res), "Admin")) {
    return renderError(res, 403, "Admin access required.");
  }
  next();
}

function requireITAdmin(req, res, next) {
  if (!res.locals.currentUser || !hasRole(roleForCheck(req, res), "IT Admin")) {
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
