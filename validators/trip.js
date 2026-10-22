const Joi = require("joi");

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const checkbox = () => Joi.string().valid("on").empty("").optional();

// The trip itself, shared by both "Log a trip" forms — a trip that
// happened without a booking.
const tripFields = {
  vehicleId: Joi.string().pattern(ID_PATTERN).required().messages({
    "string.empty": "Please choose a vehicle.",
    "any.required": "Please choose a vehicle.",
    "string.pattern.base": "Please choose a valid vehicle.",
  }),
  date: Joi.string().pattern(DATE_PATTERN).required().messages({
    "string.empty": "Please choose the date of the trip.",
    "any.required": "Please choose the date of the trip.",
    "string.pattern.base": "Please choose a valid date.",
  }),
  startTime: Joi.string().pattern(TIME_PATTERN).required().messages({
    "string.empty": "Please enter when the trip started.",
    "any.required": "Please enter when the trip started.",
    "string.pattern.base": "Please enter a valid start time.",
  }),
  endTime: Joi.string().pattern(TIME_PATTERN).required().messages({
    "string.empty": "Please enter when the trip ended.",
    "any.required": "Please enter when the trip ended.",
    "string.pattern.base": "Please enter a valid end time.",
  }),
  endMileage: Joi.number().integer().min(0).required().messages({
    "number.base": "Please enter the ending odometer reading.",
    "any.required": "Please enter the ending odometer reading.",
    "number.min": "The odometer reading can't be negative.",
  }),
  tripFoodRelated: Joi.string().valid("Yes", "No", "Other").required().messages({
    "string.empty": "Please say whether the trip was food related.",
    "any.required": "Please say whether the trip was food related.",
    "any.only": "Please choose one of the food-related options.",
  }),
  tripFoodRelatedDetail: Joi.string()
    .trim()
    .max(500)
    .when("tripFoodRelated", {
      is: "Other",
      then: Joi.string().trim().max(500).required(),
      otherwise: Joi.string().trim().max(500).empty("").optional(),
    })
    .messages({
      "string.empty": "Please briefly describe the purpose of this trip.",
      "any.required": "Please briefly describe the purpose of this trip.",
    }),
  fuelLevelEndPercent: Joi.number().integer().min(0).max(100).empty("").optional().messages({
    "number.base": "Fuel level must be a number.",
    "number.min": "Fuel level can't be negative.",
    "number.max": "Fuel level can't be more than 100%.",
  }),
  droppedOffFood: checkbox(),
  pickedUpFood: checkbox(),
  washed: checkbox(),
};

// Admin form: logs a trip for any driver; saved as Completed straight away.
const manualTripSchema = Joi.object({
  ...tripFields,
  userId: Joi.string().pattern(ID_PATTERN).required().messages({
    "string.empty": "Please choose who drove.",
    "any.required": "Please choose who drove.",
    "string.pattern.base": "Please choose a valid driver.",
  }),
  adminNotes: Joi.string().trim().max(2000).empty("").optional(),
});

// Staff form: the driver is always the person submitting; saved as
// Submitted until an admin approves it.
const staffTripSchema = Joi.object({
  ...tripFields,
  staffNotes: Joi.string().trim().max(2000).empty("").optional(),
});

module.exports = { manualTripSchema, staffTripSchema };
