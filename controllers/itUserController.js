const User = require("../models/user");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

exports.index = async (req, res) => {
  const q = (req.query.q || "").trim();
  const role = req.query.role || "";
  const filter = {};

  if (role) {
    filter.role = role;
  }

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
  }

  const users = await User.find(filter).sort({ firstName: 1, lastName: 1 });

  res.render("it/users/index", {
    title: "Manage Users",
    users,
    q,
    role,
    activeNav: "it",
  });
};

exports.edit = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).send("User not found.");
  }

  res.render("it/users/edit", {
    title: `${user.firstName} ${user.lastName}`,
    editUser: user,
    isSelf: String(user._id) === String(res.locals.currentUser._id),
    activeNav: "it",
  });
};

exports.update = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).send("User not found.");
  }

  if (String(user._id) === String(res.locals.currentUser._id)) {
    req.flash("error", "You can't change your own role or active status. Ask another IT Admin.");
    return res.redirect(`/it/users/${user._id}/edit`);
  }

  user.role = req.body.role;
  user.isActive = req.body.isActive === "on";
  await user.save();

  req.flash("success", "User updated.");
  res.redirect("/it/users");
};
