const passport = require("passport");
const User = require("../models/user");

passport.use(User.createStrategy());

// Serialize/deserialize by _id ourselves rather than using
// passport-local-mongoose's User.serializeUser(), which serializes by the
// configured usernameField (email) instead — that would mismatch with the
// _id lookup below.
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    if (!user || !user.isActive) {
      return done(null, false);
    }
    done(null, user);
  } catch (error) {
    done(error);
  }
});

module.exports = passport;
