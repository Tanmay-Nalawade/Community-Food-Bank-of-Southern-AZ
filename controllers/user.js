const passport = require("passport");
const { Op } = require("sequelize");
const { User, Reservation, ActivityLog } = require("../models");
const { landingPathForRole } = require("../middleware/auth");
const { issueToken, hashToken } = require("../utils/authTokens");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/email/accountNotifications");

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function findByEmail(email) {
  return User.findOne({ where: { email: String(email || "").trim().toLowerCase() } });
}

function findByPasswordResetToken(token) {
  return User.findOne({
    where: {
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { [Op.gt]: new Date() },
    },
  });
}

async function getLandingPath(userId) {
  const now = new Date();
  const hasBookings = await Reservation.findOne({
    attributes: ["id"],
    where: {
      userId,
      status: { [Op.in]: Reservation.OPEN_STATUSES },
      requestedEndTime: { [Op.gt]: now },
    },
  });

  return hasBookings ? "/reservations/mine" : "/";
}

// Staff land on their own booking dashboard (or the booking form if they
// have nothing on the books); Admin/IT Admin land on their management
// dashboards instead — they aren't drivers, so "do you have a booking?"
// isn't the right question for them.
async function landingPathFor(user) {
  if (user.role === "Staff") {
    return getLandingPath(user.id);
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
          userId: user.id,
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

  User.register({ firstName, lastName, email, role: "Staff" }, password).then(
    async (user) => {
      try {
        const { token, tokenHash, expiresAt } = issueToken(VERIFICATION_TOKEN_TTL_MS);
        user.emailVerificationTokenHash = tokenHash;
        user.emailVerificationExpiresAt = expiresAt;
        await user.save();
        await sendVerificationEmail(user, token);
      } catch (error) {
        return next(error);
      }

      req.flash("success", "Account created — check your email to verify it before logging in.");
      res.redirect(`/verify-email/pending?email=${encodeURIComponent(user.email)}`);
    },
    (err) => {
      req.flash("error", err.message || "Could not create your account.");
      res.redirect("/register");
    },
  );
};

exports.forgotPasswordForm = (req, res) => {
  res.render("users/forgot-password", { title: "Forgot Password", activeNav: "account" });
};

// Always flashes the same message whether or not the email exists, so this
// endpoint can't be used to enumerate registered accounts.
exports.forgotPasswordSubmit = async (req, res) => {
  const user = await findByEmail(req.body.email);

  if (user) {
    const { token, tokenHash, expiresAt } = issueToken(RESET_TOKEN_TTL_MS);
    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpiresAt = expiresAt;
    await user.save();
    await sendPasswordResetEmail(user, token);
  }

  req.flash("success", "If that email has an account, we've sent a password reset link.");
  res.redirect("/forgot-password");
};

exports.resetPasswordForm = async (req, res) => {
  const user = await findByPasswordResetToken(req.params.token);

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
  const user = await findByPasswordResetToken(req.params.token);

  if (!user) {
    req.flash("error", "That reset link is invalid or has expired. Please request a new one.");
    return res.redirect("/forgot-password");
  }

  await user.setPassword(req.body.password);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
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
  const user = await findByEmail(email);

  if (user && !user.emailVerified) {
    const { token, tokenHash, expiresAt } = issueToken(VERIFICATION_TOKEN_TTL_MS);
    user.emailVerificationTokenHash = tokenHash;
    user.emailVerificationExpiresAt = expiresAt;
    await user.save();
    await sendVerificationEmail(user, token);
  }

  req.flash("success", "If that email has an unverified account, we've sent a new verification link.");
  res.redirect(`/verify-email/pending?email=${encodeURIComponent(email)}`);
};

exports.verifyEmail = async (req, res, next) => {
  const user = await User.findOne({
    where: {
      emailVerificationTokenHash: hashToken(req.params.token),
      emailVerificationExpiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!user) {
    return res.render("users/verify-email-pending", {
      title: "Verify Your Email",
      activeNav: "account",
      email: "",
      invalidToken: true,
    });
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpiresAt = null;
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
        userId: currentUser.id,
        action: "Logout",
        ip: req.ip,
      });
    }

    req.session.regenerate(() => {
      req.flash("success", "You have been logged out.");
      // "/" requires login (it's the Staff dashboard entry point), so
      // redirecting there right after destroying the session immediately
      // bounced through requireLogin and stacked "Please log in first." on
      // top of this flash, for every role. Send straight to /login instead.
      res.redirect("/login");
    });
  });
};
