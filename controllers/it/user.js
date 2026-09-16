const User = require("../../models/user");
const { renderError } = require("../../utils/httpError");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUserFilter(query) {
  const q = (query.q || "").trim();
  const role = query.role || "";
  const filter = {};

  if (role) {
    filter.role = role;
  }

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
  }

  return filter;
}

function filterQueryString(query) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.role) params.set("role", query.role);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

exports.index = async (req, res) => {
  const q = (req.query.q || "").trim();
  const role = req.query.role || "";
  const filter = buildUserFilter(req.query);

  const { items: users, hasMore, nextSkip } = await fetchPage(
    (skip, limit) =>
      User.find(filter).sort({ firstName: 1, lastName: 1 }).skip(skip).limit(limit),
    0,
  );

  res.render("it/users/index", {
    title: "Manage Users",
    users,
    q,
    role,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    moreUrl: `/it/users/more${filterQueryString(req.query)}`,
    activeNav: "it-users",
  });
};

exports.more = async (req, res) => {
  const filter = buildUserFilter(req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: users, hasMore } = await fetchPage(
    (s, limit) => User.find(filter).sort({ firstName: 1, lastName: 1 }).skip(s).limit(limit),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("it/users/_rows", { users });
};

exports.edit = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return renderError(res, 404, "User not found.");
  }

  res.render("it/users/edit", {
    title: `${user.firstName} ${user.lastName}`,
    editUser: user,
    isSelf: String(user._id) === String(res.locals.currentUser._id),
    activeNav: "it-users",
  });
};

exports.update = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return renderError(res, 404, "User not found.");
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
