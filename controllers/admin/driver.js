const { User, Reservation } = require("../../models");
const { renderError } = require("../../utils/httpError");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");
const { queryString, containsAny } = require("../../utils/query");

const BY_NAME = [["firstName", "ASC"], ["lastName", "ASC"]];

function buildDriverFilter(query) {
  const q = queryString(query.q);
  return q ? containsAny(["firstName", "lastName", "email"], q) : {};
}

function fetchDriverReservations(userId) {
  return (skip, limit) =>
    Reservation.findAll({
      where: { userId },
      include: [{ association: "vehicle", attributes: ["id", "make", "model", "year", "licensePlate"] }],
      order: [["requestedStartTime", "DESC"], ["id", "DESC"]],
      offset: skip,
      limit,
    });
}

exports.index = async (req, res) => {
  const q = queryString(req.query.q);
  const where = buildDriverFilter(req.query);

  const { items: drivers, hasMore, nextSkip } = await fetchPage(
    (skip, limit) => User.findAll({ where, order: BY_NAME, offset: skip, limit }),
    0,
  );

  res.render("admin/drivers/index", {
    title: "Drivers",
    drivers,
    q,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    moreUrl: `/admin/drivers/more${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    activeNav: "admin-drivers",
  });
};

exports.more = async (req, res) => {
  const where = buildDriverFilter(req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: drivers, hasMore } = await fetchPage(
    (s, limit) => User.findAll({ where, order: BY_NAME, offset: s, limit }),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/drivers/_rows", { drivers });
};

exports.show = async (req, res) => {
  const driver = await User.findByPk(req.params.id);

  if (!driver) {
    return renderError(res, 404, "Driver not found.");
  }

  const { items: reservations, hasMore, nextSkip } = await fetchPage(
    fetchDriverReservations(driver.id),
    0,
  );

  res.render("admin/drivers/show", {
    title: `${driver.firstName} ${driver.lastName}`,
    driver,
    reservations,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "admin-drivers",
  });
};

exports.moreReservations = async (req, res) => {
  const driver = await User.findByPk(req.params.id);

  if (!driver) {
    return renderError(res, 404, "Driver not found.");
  }

  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(
    fetchDriverReservations(driver.id),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/drivers/_reservation-rows", { reservations });
};
