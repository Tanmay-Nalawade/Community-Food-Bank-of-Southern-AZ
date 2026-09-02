const Joi = require("joi");

const loginSchema = Joi.object({
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).required().messages({
    "string.empty": "Email is required.",
    "any.required": "Email is required.",
    "string.email": "Please enter a valid email address.",
  }),
  password: Joi.string().allow("").optional(),
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
  password: Joi.string().allow("").optional(),
  confirmPassword: Joi.string().allow("").optional(),
});

module.exports = { loginSchema, registerSchema };
