const Vehicle = require("../models/vehicle");

exports.index = async (req, res) => {
  const vehicles = await Vehicle.find({}).sort({ make: 1, model: 1 });
  res.render("vehicles/index", {
    title: "Vehicles",
    vehicles,
  });
};
