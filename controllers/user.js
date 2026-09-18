const passport = require("passport");
const User = require("../models/user");
const Reservation = require("../models/reservation");
const ActivityLog = require("../models/activityLog");
const { landingPathForRole } = require("../middleware/auth");
const { issueToken, hashToken } = require("../utils/authTokens");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/email/accountNotifications");

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

    if (!user.emailVerified) {
      req.flash("error", "Please verify your email before logging in.");
      return res.redirect(`/verify-email/pending?email=${encodeURIComponent(user.email)}`);
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

  User.register(new User({ firstName, lastName, email, role: "Staff" }), password, async (err, user) => {
    if (err) {
      req.flash("error", err.message || "Could not create your account.");
      return res.redirect("/register");
    }

    try {
      const { token, tokenHash, expiresAt } = issueToken(VERIFICATION_TOKEN_TTL_MS);
      user.emailVerification = { tokenHash, expiresAt };
      await user.save();
      await sendVerificationEmail(user, token);
    } catch (error) {
      return next(error);
    }

    req.flash("success", "Account created — check your email to verify it before logging in.");
    res.redirect(`/verify-email/pending?email=${encodeURIComponent(user.email)}`);
  });
};

exports.forgotPasswordForm = (req, res) => {
  res.render("users/forgot-password", { title: "Forgot Password", activeNav: "account" });
};

// Always flashes the same message whether or not the email exists, so this
// endpoint can't be used to enumerate registered accounts.
exports.forgotPasswordSubmit = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user) {
    const { token, tokenHash, expiresAt } = issueToken(RESET_TOKEN_TTL_MS);
    user.passwordReset = { tokenHash, expiresAt };
    await user.save();
    await sendPasswordResetEmail(user, token);
  }

  req.flash("success", "If that email has an account, we've sent a password reset link.");
  res.redirect("/forgot-password");
};

exports.resetPasswordForm = async (req, res) => {
  const user = await User.findOne({
    "passwordReset.tokenHash": hashToken(req.params.token),
    "passwordReset.expiresAt": { $gt: new Date() },
  }).select("+passwordReset.tokenHash +passwordReset.expiresAt");

  if (!user) {
    return res.render("users/reset-password", {
      title: "Reset Password",
      activeNav: "account",
      invalid: true,
      token: req.params.token,
    });
  }

  res.render("users/reset-password", {
    title: "Reset Password",
    activeNav: "account",
    invalid: false,
    token: req.params.token,
  });
};

exports.resetPasswordSubmit = async (req, res) => {
  const user = await User.findOne({
    "passwordReset.tokenHash": hashToken(req.params.token),
    "passwordReset.expiresAt": { $gt: new Date() },
  }).select("+passwordReset.tokenHash +passwordReset.expiresAt");

  if (!user) {
    req.flash("error", "That reset link is invalid or has expired. Please request a new one.");
    return res.redirect("/forgot-password");
  }

  await user.setPassword(req.body.password);
  user.passwordReset = undefined;
  await user.save();

  req.flash("success", "Your password has been reset. Please log in.");
  res.redirect("/login");
};

exports.verifyEmailPendingForm = (req, res) => {
  res.render("users/verify-email-pending", {
    title: "Verify Your Email",
    activeNav: "account",
    email: req.query.email || "",
  });
};

// Same generic-success treatment as forgotPasswordSubmit, for the same
// account-enumeration reason.
exports.resendVerification = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user && !user.emailVerified) {
    const { token, tokenHash, expiresAt } = issueToken(VERIFICATION_TOKEN_TTL_MS);
    user.emailVerification = { tokenHash, expiresAt };
    await user.save();
    await sendVerificationEmail(user, token);
  }

  req.flash("success", "If that email has an unverified account, we've sent a new verification link.");
  res.redirect(`/verify-email/pending?email=${encodeURIComponent(email)}`);
};

exports.verifyEmail = async (req, res, next) => {
  const user = await User.findOne({
    "emailVerification.tokenHash": hashToken(req.params.token),
    "emailVerification.expiresAt": { $gt: new Date() },
  }).select("+emailVerification.tokenHash +emailVerification.expiresAt");

  if (!user) {
    return res.render("users/verify-email-pending", {
      title: "Verify Your Email",
      activeNav: "account",
      email: "",
      invalidToken: true,
    });
  }

  user.emailVerified = true;
  user.emailVerification = undefined;
  await user.save();

  req.session.regenerate((regenerateErr) => {
    if (regenerateErr) {
      return next(regenerateErr);
    }

    req.login(user, async (loginErr) => {
      if (loginErr) {
        return next(loginErr);
      }

      req.flash("success", `Welcome, ${user.firstName}! Your email is verified.`);
      res.redirect(await landingPathFor(user));
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
