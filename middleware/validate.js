const { renderError } = require("../utils/httpError");

function validateBody(schema, options = {}) {
  const { redirect } = options;

  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map((detail) => detail.message).join(" ");
      req.flash("error", message);
      const target = typeof redirect === "function" ? redirect(req) : redirect || "/";
      return res.redirect(target);
    }

    req.body = value;
    next();
  };
}


// Primary keys are auto-increment integers. MySQL would silently coerce a
// malformed id like "12abc" to 12, so anything that isn't all digits is
// rejected up front with a 400 "invalid link" page.
const ID_PATTERN = /^[1-9]\d{0,9}$/;

function validateIdParams(router, names) {
  names.forEach((name) => {
    router.param(name, (req, res, next, value) => {
      if (!ID_PATTERN.test(value)) {
        return renderError(res, 400, "That link looks invalid or malformed.");
      }
      next();
    });
  });
}

module.exports = { validateBody, validateIdParams, ID_PATTERN };
