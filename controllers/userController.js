const User = require("../models/user");
const Reservation = require("../models/reservation");
const ActivityLog = require("../models/activityLog");

async function getLandingPath(userId) {
  const now = new Date();
  const hasBookings = await Reservation.exists({
    userId,
    status: { $in: ["Pending", "Reserved", "Active"] },
    requestedEndTime: { $gt: now },
  });

  return hasBookings ? "/reservations/mine" : "/";
}

exports.home = (req, res) => {
  const today = new Date();
  const minDate = today.toISOString().split("T")[0];

  res.render("home", {
    title: "Home",
    minDate,
    date: req.query.date || "",
    startTime: req.query.startTime || "08:00",
    endTime: req.query.endTime || "17:00",
  });
};

exports.login = async (req, res) => {
  if (req.method === "GET") {
    return res.render("users/login", {
      title: "Log In",
      activeNav: "account",
    });
  }

  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    req.flash("error", "We couldn't find an account with that email. Use a seeded staff or admin account.");
    return res.redirect("/login");
  }

  req.session.userId = user._id;
  const redirectTo = req.session.returnTo;
  req.session.returnTo = null;

  await ActivityLog.create({
    userId: user._id,
    action: "Login",
    detail: `Logged in as ${user.role}`,
    ip: req.ip,
  });

  req.flash("success", `Welcome back, ${user.firstName}!`);

  if (redirectTo && redirectTo !== "/") {
    return res.redirect(redirectTo);
  }

  res.redirect(await getLandingPath(user._id));
};

exports.register = async (req, res) => {
  if (req.method === "GET") {
    return res.render("users/register", {
      title: "Sign Up",
      activeNav: "account",
    });
  }

  const { firstName, lastName, email } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    req.flash("error", "An account with that email already exists.");
    return res.redirect("/register");
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    role: "Staff",
  });

  req.session.userId = user._id;
  req.flash("success", `Welcome, ${user.firstName}! Your account has been created.`);
  res.redirect(await getLandingPath(user._id));
};

exports.logout = async (req, res) => {
  const currentUser = res.locals.currentUser;

  if (currentUser) {
    await ActivityLog.create({
      userId: currentUser._id,
      action: "Logout",
      ip: req.ip,
    });
  }

  req.session.regenerate(() => {
    req.flash("success", "You have been logged out.");
    res.redirect("/");
  });
};
