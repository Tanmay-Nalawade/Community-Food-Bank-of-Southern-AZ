const User = require("../models/user");

async function loadCurrentUser(req, res, next) {
  res.locals.currentUser = null;

  if (!req.session.userId) {
    return next();
  }

  const user = await User.findById(req.session.userId);
  if (!user || !user.isActive) {
    req.session.userId = null;
    return next();
  }

  res.locals.currentUser = user;
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
  if (!res.locals.currentUser || res.locals.currentUser.role !== "Admin") {
    return res.status(403).send("Admin access required.");
  }
  next();
}

module.exports = {
  loadCurrentUser,
  requireLogin,
  requireAdmin,
};
