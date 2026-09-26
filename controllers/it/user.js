const { User } = require("../../models");
const { renderError } = require("../../utils/httpError");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");
const { queryString, containsAny } = require("../../utils/query");

const BY_NAME = [["firstName", "ASC"], ["lastName", "ASC"]];

function buildUserFilter(query) {
  const q = queryString(query.q);
  const role = queryString(query.role);
  const where = {};

  if (role) {
    where.role = role;
  }

  if (q) {
    Object.assign(where, containsAny(["firstName", "lastName", "email"], q));
  }

  return where;
}

function filterQueryString(query) {
  const params = new URLSearchParams();
  const q = queryString(query.q);
  const role = queryString(query.role);
  if (q) params.set("q", q);
  if (role) params.set("role", role);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

exports.index = async (req, res) => {
  const where = buildUserFilter(req.query);

  const { items: users, hasMore, nextSkip } = await fetchPage(
    (skip, limit) => User.findAll({ where, order: BY_NAME, offset: skip, limit }),
    0,
  );

  res.render("it/users/index", {
    title: "Manage Users",
    users,
    q: queryString(req.query.q),
    role: queryString(req.query.role),
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    moreUrl: `/it/users/more${filterQueryString(req.query)}`,
    activeNav: "it-users",
  });
};

exports.more = async (req, res) => {
  const where = buildUserFilter(req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: users, hasMore } = await fetchPage(
    (s, limit) => User.findAll({ where, order: BY_NAME, offset: s, limit }),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("it/users/_rows", { users });
};

exports.edit = async (req, res) => {
  const user = await User.findByPk(req.params.id);

  if (!user) {
    return renderError(res, 404, "User not found.");
  }

  res.render("it/users/edit", {
    title: `${user.firstName} ${user.lastName}`,
    editUser: user,
    isSelf: user.id === res.locals.currentUser.id,
    activeNav: "it-users",
  });
};

exports.update = async (req, res) => {
  const user = await User.findByPk(req.params.id);

  if (!user) {
    return renderError(res, 404, "User not found.");
  }

  if (user.id === res.locals.currentUser.id) {
    req.flash("error", "You can't change your own role or active status. Ask another IT Admin.");
    return res.redirect(`/it/users/${user.id}/edit`);
  }

  user.role = req.body.role;
  user.isActive = req.body.isActive === "on";
  user.emailVerified = req.body.emailVerified === "on";
  await user.save();

  req.flash("success", "User updated.");
  res.redirect("/it/users");
};
