const Vehicle = require("../../models/vehicle");
const { renderError } = require("../../utils/httpError");
const { buildMonthlyLog } = require("../../services/mileageLog");

exports.show = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;

  const log = await buildMonthlyLog(vehicle._id, year, month);

  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  res.render("admin/mileage-log/show", {
    title: `Mileage Log — ${vehicle.make} ${vehicle.model}`,
    vehicle,
    log,
    year,
    month,
    prev,
    next,
    activeNav: "admin-vehicles",
  });
};
