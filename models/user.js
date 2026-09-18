const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ["Staff", "Admin", "IT Admin"],
      default: "Staff",
    },
    isActive: { type: Boolean, default: true },

    emailVerified: { type: Boolean, default: false },
    // select: false keeps these out of normal User.find() results, same
    // spirit as never exposing password-adjacent secrets by default —
    // callers that need to check a token explicitly .select() it back in.
    emailVerification: {
      tokenHash: { type: String, select: false },
      expiresAt: { type: Date, select: false },
    },
    passwordReset: {
      tokenHash: { type: String, select: false },
      expiresAt: { type: Date, select: false },
    },
  },
  { timestamps: true },
);

userSchema.plugin(passportLocalMongoose, {
  usernameField: "email",
  // Without this, "User@Example.com" and "user@example.com" register (and
  // log in) as two distinct accounts, since the username lookup used for
  // both registration's duplicate check and login is otherwise case-sensitive.
  usernameLowerCase: true,
  errorMessages: {
    IncorrectPasswordError: "Incorrect email or password.",
    IncorrectUsernameError: "Incorrect email or password.",
    UserExistsError: "An account with that email already exists.",
  },
});

module.exports = mongoose.model("User", userSchema);
