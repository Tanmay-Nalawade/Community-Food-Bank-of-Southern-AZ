exports.home = (req, res) => {
  res.render("home", { title: "Home" });
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
