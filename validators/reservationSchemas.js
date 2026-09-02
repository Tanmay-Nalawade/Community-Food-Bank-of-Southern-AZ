const Joi = require("joi");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const bookingWindowSchema = Joi.object({
  date: Joi.string().pattern(DATE_PATTERN).required().messages({
    "string.empty": "Please choose a date.",
    "any.required": "Please choose a date.",
    "string.pattern.base": "Please choose a valid date.",
  }),
  startTime: Joi.string().pattern(TIME_PATTERN).required().messages({
    "string.empty": "Please choose a start time.",
    "any.required": "Please choose a start time.",
    "string.pattern.base": "Please choose a valid start time.",
  }),
  endTime: Joi.string().pattern(TIME_PATTERN).required().messages({
    "string.empty": "Please choose an end time.",
    "any.required": "Please choose an end time.",
    "string.pattern.base": "Please choose a valid end time.",
  }),
  staffNotes: Joi.string().trim().max(1000).empty("").optional(),
});

const mileageSchema = Joi.object({
  startMileage: Joi.number().integer().min(0).empty("").optional().messages({
    "number.base": "Start mileage must be a number.",
    "number.min": "Start mileage can't be negative.",
  }),
  endMileage: Joi.number().integer().min(0).empty("").optional().messages({
    "number.base": "End mileage must be a number.",
    "number.min": "End mileage can't be negative.",
  }),
});

const issueSchema = Joi.object({
  description: Joi.string().trim().min(1).max(2000).required().messages({
    "string.empty": "Please describe the issue.",
    "any.required": "Please describe the issue.",
  }),
});

module.exports = { bookingWindowSchema, mileageSchema, issueSchema };
