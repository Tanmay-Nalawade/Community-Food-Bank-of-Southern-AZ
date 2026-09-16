const TITLES = {
  400: "Invalid Request",
  403: "Access Denied",
  404: "Not Found",
};

// Renders the same branded error page app.js's 404/500 handlers use,
// instead of a bare unstyled res.send() string — for any error a real
// person can hit in their browser (not the /webhooks/* routes, which
// intentionally reply with plain text to KeyCafe, not a person).
function renderError(res, status, message, title) {
  res.status(status);
  res.render("errors/error", {
    title: title || TITLES[status] || "Something Went Wrong",
    status,
    message,
    activeNav: null,
  });
}

module.exports = { renderError };
