const User = require("../models/user");

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

exports.account = (req, res) => {
  if (!res.locals.currentUser) {
    return res.render("account", { title: "My Account", activeNav: "account" });
  }

  res.render("account", {
    title: "My Account",
    activeNav: "account",
    user: res.locals.currentUser,
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
  const redirectTo = req.session.returnTo || "/";
  req.session.returnTo = null;
  res.redirect(redirectTo);
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
  res.redirect("/");
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
};
