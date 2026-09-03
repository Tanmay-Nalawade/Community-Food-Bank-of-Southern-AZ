const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: {
      type: String,
      enum: ["Staff", "Admin"],
      default: "Staff",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.plugin(passportLocalMongoose, {
  usernameField: "email",
  errorMessages: {
    IncorrectPasswordError: "Incorrect email or password.",
    IncorrectUsernameError: "Incorrect email or password.",
    UserExistsError: "An account with that email already exists.",
  },
});

module.exports = mongoose.model("User", userSchema);
