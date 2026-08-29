const User = require("../models/user");
const Reservation = require("../models/reservation");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

exports.index = async (req, res) => {
  const q = (req.query.q || "").trim();
  const filter = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
  }

  const drivers = await User.find(filter).sort({ firstName: 1, lastName: 1 });

  res.render("admin/drivers/index", {
    title: "Drivers",
    drivers,
    q,
    activeNav: "admin",
  });
};

exports.show = async (req, res) => {
  const driver = await User.findById(req.params.id);

  if (!driver) {
    return res.status(404).send("Driver not found.");
  }

  const reservations = await Reservation.find({ userId: driver._id })
    .populate("vehicleId", "make model year licensePlate")
    .sort({ requestedStartTime: -1 })
    .limit(50);

  res.render("admin/drivers/show", {
    title: `${driver.firstName} ${driver.lastName}`,
    driver,
    reservations,
    activeNav: "admin",
  });
};
