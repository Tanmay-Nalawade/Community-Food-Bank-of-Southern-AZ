const Joi = require("joi");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const updateReservationSchema = Joi.object({
  vehicleId: Joi.string().pattern(OBJECT_ID_PATTERN).required().messages({
    "string.pattern.base": "Please choose a valid vehicle.",
    "any.required": "Please choose a vehicle.",
  }),
  date: Joi.string().pattern(DATE_PATTERN).required().messages({
    "string.pattern.base": "Please choose a valid date.",
    "any.required": "Please choose a date.",
  }),
  startTime: Joi.string().pattern(TIME_PATTERN).required().messages({
    "string.pattern.base": "Please choose a valid start time.",
    "any.required": "Please choose a start time.",
  }),
  endTime: Joi.string().pattern(TIME_PATTERN).required().messages({
    "string.pattern.base": "Please choose a valid end time.",
    "any.required": "Please choose an end time.",
  }),
  status: Joi.string()
    .valid("Pending", "Reserved", "Active", "Completed", "Cancelled", "Denied")
    .required()
    .messages({
      "any.required": "Please choose a status.",
      "any.only": "Please choose a valid status.",
    }),
  adminNotes: Joi.string().trim().max(2000).empty("").optional(),
});

const adminNotesSchema = Joi.object({
  adminNotes: Joi.string().trim().max(2000).empty("").optional(),
});

module.exports = { updateReservationSchema, adminNotesSchema };
