const passport = require("passport");
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

exports.login = (req, res, next) => {
  if (req.method === "GET") {
    return res.render("users/login", {
      title: "Log In",
      activeNav: "account",
    });
  }

  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      req.flash("error", info?.message || "Incorrect email or password.");
      return res.redirect("/login");
    }

    const returnTo = req.session.returnTo;

    // Regenerate the session on login (not just logout) so a session ID
    // that existed before authentication can never be reused afterward.
    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) {
        return next(regenerateErr);
      }

      req.login(user, async (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }

        req.flash("success", `Welcome back, ${user.firstName}!`);

        if (returnTo && returnTo !== "/") {
          return res.redirect(returnTo);
        }

        res.redirect(await getLandingPath(user._id));
      });
    });
  })(req, res, next);
};

exports.register = (req, res, next) => {
  if (req.method === "GET") {
    return res.render("users/register", {
      title: "Sign Up",
      activeNav: "account",
    });
  }

  const { firstName, lastName, email, password } = req.body;

  User.register(new User({ firstName, lastName, email, role: "Staff" }), password, (err, user) => {
    if (err) {
      req.flash("error", err.message || "Could not create your account.");
      return res.redirect("/register");
    }

    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) {
        return next(regenerateErr);
      }

      req.login(user, async (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }

        req.flash("success", `Welcome, ${user.firstName}! Your account has been created.`);
        res.redirect(await getLandingPath(user._id));
      });
    });
  });
};

exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }

    req.session.regenerate(() => {
      req.flash("success", "You have been logged out.");
      res.redirect("/");
    });
  });
};
