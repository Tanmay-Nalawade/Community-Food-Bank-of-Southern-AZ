const User = require("../models/user");
const Reservation = require("../models/reservation");

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
    return res.status(401).send("Invalid email. Use a seeded staff or admin account.");
  }

  req.session.userId = user._id;
  const redirectTo = req.session.returnTo;
  req.session.returnTo = null;

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
    return res.status(400).send("An account with that email already exists.");
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    role: "Staff",
  });

  req.session.userId = user._id;
  res.redirect(await getLandingPath(user._id));
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
};
