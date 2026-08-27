exports.home = (req, res) => {
  const today = new Date();
  const minDate = today.toISOString().split("T")[0];

  res.render("home", {
    title: "Home",
    minDate,
    date: req.query.date || "",
    startTime: req.query.startTime || "08:00",
    endTime: req.query.endTime || "17:00",
  });
};

exports.account = (req, res) => {
  res.render("account", { title: "My Account", activeNav: "account" });
};

exports.login = (req, res) => {
  res.render("users/login", { title: "Log In", activeNav: "account" });
};

exports.register = (req, res) => {
  res.render("users/register", { title: "Sign Up", activeNav: "account" });
};
