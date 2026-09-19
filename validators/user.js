const Joi = require("joi");

// Kept in sync manually with the client-side data-require-domain attribute
// in the register/account-edit views and the PASSWORD_RULES list in
// public/js/app.js — there's no shared config between server and client JS
// in this app, so both sides just have to agree on these values.
const FOODBANK_EMAIL_DOMAIN = "@communityfoodbank.org";

// Only used where an email is being set/claimed (registering, editing your
// own profile) — not on login/forgot-password/resend-verification, which
// just look an existing account up by whatever email it already has.
function foodBankEmailSchema() {
  return Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(255)
    .required()
    .custom((value, helpers) => {
      if (!value.endsWith(FOODBANK_EMAIL_DOMAIN)) {
        return helpers.message(
          `You need to use an email address given to you by the Food Bank (ends in ${FOODBANK_EMAIL_DOMAIN}).`,
        );
      }
      return value;
    })
    .messages({
      "string.empty": "Email is required.",
      "any.required": "Email is required.",
      "string.email": "Please enter a valid email address.",
    });
}

// Same "bunch of options" rules shown live client-side (PASSWORD_RULES in
// public/js/app.js) — reported together in one message since Joi's abortEarly
// only surfaces one custom error per field per submit anyway.
function strongPasswordSchema() {
  return Joi.string()
    .min(8)
    .max(200)
    .required()
    .custom((value, helpers) => {
      const missing = [];
      if (!/[a-z]/.test(value)) missing.push("a lowercase letter");
      if (!/[A-Z]/.test(value)) missing.push("an uppercase letter");
      if (!/[0-9]/.test(value)) missing.push("a number");
      if (!/[^A-Za-z0-9]/.test(value)) missing.push("a special character");

      if (missing.length) {
        return helpers.message(`Password must include ${missing.join(", ")}.`);
      }
      return value;
    })
    .messages({
      "string.empty": "Password is required.",
      "any.required": "Password is required.",
      "string.min": "Password must be at least 8 characters.",
    });
}

const loginSchema = Joi.object({
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).required().messages({
    "string.empty": "Email is required.",
    "any.required": "Email is required.",
    "string.email": "Please enter a valid email address.",
  }),
  password: Joi.string().min(1).required().messages({
    "string.empty": "Password is required.",
    "any.required": "Password is required.",
  }),
});

const registerSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "First name is required.",
    "any.required": "First name is required.",
  }),
  lastName: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Last name is required.",
    "any.required": "Last name is required.",
  }),
  email: foodBankEmailSchema(),
  password: strongPasswordSchema(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match.",
    "any.required": "Please confirm your password.",
  }),
});

const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "First name is required.",
    "any.required": "First name is required.",
  }),
  lastName: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Last name is required.",
    "any.required": "Last name is required.",
  }),
  email: foodBankEmailSchema(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).required().messages({
    "string.empty": "Your current password is required.",
    "any.required": "Your current password is required.",
  }),
  newPassword: strongPasswordSchema(),
  confirmNewPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "Passwords do not match.",
    "any.required": "Please confirm your new password.",
  }),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).required().messages({
    "string.empty": "Email is required.",
    "any.required": "Email is required.",
    "string.email": "Please enter a valid email address.",
  }),
});

const resendVerificationSchema = forgotPasswordSchema;

const resetPasswordSchema = Joi.object({
  password: strongPasswordSchema(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match.",
    "any.required": "Please confirm your password.",
  }),
});

module.exports = {
  FOODBANK_EMAIL_DOMAIN,
  loginSchema,
  registerSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resendVerificationSchema,
  resetPasswordSchema,
};
