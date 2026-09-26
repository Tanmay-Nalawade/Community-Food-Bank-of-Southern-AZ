const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const { User } = require("../models");

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const user = await User.authenticate(email, password);
      if (!user) {
        return done(null, false, { message: User.AUTH_ERRORS.incorrect });
      }
      done(null, user);
    } catch (error) {
      done(error);
    }
  }),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    if (!user || !user.isActive) {
      return done(null, false);
    }
    done(null, user);
  } catch (error) {
    done(error);
  }
});

module.exports = passport;
