const Joi = require("joi");

const addVehicleSchema = Joi.object({
  make: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Make is required.",
    "any.required": "Make is required.",
  }),
  model: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Model is required.",
    "any.required": "Model is required.",
  }),
  year: Joi.number().integer().min(1900).max(2100).empty("").optional().messages({
    "number.base": "Year must be a number.",
    "number.min": "Year must be 1900 or later.",
    "number.max": "Year must be 2100 or earlier.",
  }),
  licensePlate: Joi.string().trim().min(1).max(20).required().messages({
    "string.empty": "License plate is required.",
    "any.required": "License plate is required.",
  }),
  photoUrl: Joi.string()
    .trim()
    .uri({ scheme: ["https"] })
    .max(2000)
    .empty("")
    .optional()
    .messages({
      "string.uri": "Photo URL must be a valid https:// URL.",
      "string.uriCustomScheme": "Photo URL must be a valid https:// URL.",
    }),
  currentMileage: Joi.number().integer().min(0).required().messages({
    "number.base": "Enter the vehicle's current odometer reading.",
    "any.required": "Enter the vehicle's current odometer reading.",
    "number.min": "The odometer reading can't be negative.",
  }),
});

module.exports = { addVehicleSchema };
