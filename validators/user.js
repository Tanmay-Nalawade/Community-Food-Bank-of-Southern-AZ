const Joi = require("joi");

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
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).required().messages({
    "string.empty": "Email is required.",
    "any.required": "Email is required.",
    "string.email": "Please enter a valid email address.",
  }),
  password: Joi.string().min(8).max(200).required().messages({
    "string.empty": "Password is required.",
    "any.required": "Password is required.",
    "string.min": "Password must be at least 8 characters.",
  }),
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
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).required().messages({
    "string.empty": "Email is required.",
    "any.required": "Email is required.",
    "string.email": "Please enter a valid email address.",
  }),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).required().messages({
    "string.empty": "Your current password is required.",
    "any.required": "Your current password is required.",
  }),
  newPassword: Joi.string().min(8).max(200).required().messages({
    "string.empty": "New password is required.",
    "any.required": "New password is required.",
    "string.min": "New password must be at least 8 characters.",
  }),
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
  password: Joi.string().min(8).max(200).required().messages({
    "string.empty": "Password is required.",
    "any.required": "Password is required.",
    "string.min": "Password must be at least 8 characters.",
  }),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match.",
    "any.required": "Please confirm your password.",
  }),
});

module.exports = {
  loginSchema,
  registerSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resendVerificationSchema,
  resetPasswordSchema,
};
