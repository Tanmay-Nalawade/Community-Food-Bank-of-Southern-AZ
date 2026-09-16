const User = require("../models/user");
const Reservation = require("../models/reservation");
const { fetchPage, PAGE_SIZE } = require("../utils/pagination");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDriverFilter(query) {
  const q = (query.q || "").trim();
  const filter = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
  }

  return filter;
}

exports.index = async (req, res) => {
  const q = (req.query.q || "").trim();
  const filter = buildDriverFilter(req.query);

  const { items: drivers, hasMore, nextSkip } = await fetchPage(
    (skip, limit) =>
      User.find(filter).sort({ firstName: 1, lastName: 1 }).skip(skip).limit(limit),
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
  const filter = buildDriverFilter(req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: drivers, hasMore } = await fetchPage(
    (s, limit) => User.find(filter).sort({ firstName: 1, lastName: 1 }).skip(s).limit(limit),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/drivers/_rows", { drivers });
};

exports.show = async (req, res) => {
  const driver = await User.findById(req.params.id);

  if (!driver) {
    return res.status(404).send("Driver not found.");
  }

  const fetchReservations = (skip, limit) =>
    Reservation.find({ userId: driver._id })
      .populate("vehicleId", "make model year licensePlate")
      .sort({ requestedStartTime: -1 })
      .skip(skip)
      .limit(limit);

  const { items: reservations, hasMore, nextSkip } = await fetchPage(fetchReservations, 0);

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
  const driver = await User.findById(req.params.id);

  if (!driver) {
    return res.status(404).send("Driver not found.");
  }

  const skip = Math.max(0, Number(req.query.skip) || 0);

  const fetchReservations = (s, limit) =>
    Reservation.find({ userId: driver._id })
      .populate("vehicleId", "make model year licensePlate")
      .sort({ requestedStartTime: -1 })
      .skip(s)
      .limit(limit);

  const { items: reservations, hasMore } = await fetchPage(fetchReservations, skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/drivers/_reservation-rows", { reservations });
};
