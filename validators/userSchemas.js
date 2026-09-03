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

module.exports = { loginSchema, registerSchema };
