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
  requireLogin,
  requireAdmin,
};
