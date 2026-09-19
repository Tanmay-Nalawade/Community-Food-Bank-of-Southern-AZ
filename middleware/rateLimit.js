const rateLimit = require("express-rate-limit");

// Both endpoints this guards (forgot-password, resend-verification) accept
// just an email address and trigger an outgoing email — without a limit,
// either can be hammered to spam a target inbox or burn through SMTP send
// quota. Keyed by IP (via trust proxy, already set in app.js) rather than
// the submitted email, so it also can't be used to lock a specific account's
// notifications out from someone else's traffic.
function createAuthRateLimiter(redirectPath) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      req.flash("error", "Too many requests. Please wait a while before trying again.");
      res.redirect(redirectPath);
    },
  });
}

module.exports = { createAuthRateLimiter };
