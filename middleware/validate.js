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

module.exports = { validateBody };
