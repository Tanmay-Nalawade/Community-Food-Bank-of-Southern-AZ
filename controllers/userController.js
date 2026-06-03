exports.home = (req, res) => {
  res.render("home", { title: "Home" });
};

exports.account = (req, res) => {
  res.render("account", { title: "My Account", activeNav: "account" });
};
