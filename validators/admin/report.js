const Joi = require("joi");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Reports page "Email trip log" form. Any valid address is allowed (it may
// be an outside auditor or fleet vendor, not just a Food Bank mailbox).
const sendTripLogSchema = Joi.object({
  recipient: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255).required().messages({
    "string.empty": "Enter the email address to send the trip log to.",
    "any.required": "Enter the email address to send the trip log to.",
    "string.email": "Please enter a valid email address.",
  }),
  fromDate: Joi.string().pattern(DATE_PATTERN).required().messages({
    "string.empty": "Choose the first day to include.",
    "any.required": "Choose the first day to include.",
    "string.pattern.base": "Choose a valid start date.",
  }),
  toDate: Joi.string()
    .pattern(DATE_PATTERN)
    .required()
    .custom((value, helpers) => {
      const { fromDate } = helpers.state.ancestors[0];
      // Same-format YYYY-MM-DD strings compare correctly as plain strings.
      if (fromDate && value < fromDate) {
        return helpers.message("The end date can't be before the start date.");
      }
      return value;
    })
    .messages({
      "string.empty": "Choose the last day to include.",
      "any.required": "Choose the last day to include.",
      "string.pattern.base": "Choose a valid end date.",
    }),
});

module.exports = { sendTripLogSchema };
