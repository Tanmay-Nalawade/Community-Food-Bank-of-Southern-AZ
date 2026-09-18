const passport = require("passport");
const User = require("../models/user");
const Reservation = require("../models/reservation");
const ActivityLog = require("../models/activityLog");
const { landingPathForRole } = require("../middleware/auth");

async function getLandingPath(userId) {
  const now = new Date();
  const hasBookings = await Reservation.exists({
    userId,
    status: { $in: ["Pending", "Reserved", "Active"] },
    requestedEndTime: { $gt: now },
  });

  return hasBookings ? "/reservations/mine" : "/";
}

// Staff land on their own booking dashboard (or the booking form if they
// have nothing on the books); Admin/IT Admin land on their management
// dashboards instead — they aren't drivers, so "do you have a booking?"
// isn't the right question for them.
async function landingPathFor(user) {
  if (user.role === "Staff") {
    return getLandingPath(user._id);
  }
  return landingPathForRole(user.role);
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

        await ActivityLog.create({
          userId: user._id,
          action: "Login",
          detail: `Logged in as ${user.role}`,
          ip: req.ip,
        });

        req.flash("success", `Welcome back, ${user.firstName}!`);

        if (returnTo && returnTo !== "/") {
          return res.redirect(returnTo);
        }

        res.redirect(await landingPathFor(user));
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

  const { firstName, lastName, password } = req.body;
  const email = (req.body.email || "").trim();

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
  const currentUser = res.locals.currentUser;

  req.logout(async (err) => {
    if (err) {
      return next(err);
    }

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
  });
};
