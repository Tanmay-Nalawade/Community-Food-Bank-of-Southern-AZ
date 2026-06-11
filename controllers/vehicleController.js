const Vehicle = require("../models/vehicle");

exports.getAddVehicle = (req, res) => {
  res.render("vehicles/add", {
    title: "Add Vehicle",
  });
}

exports.postAddVehicle = async (req, res) => {
  const { make, model, year, licensePlate, keyCafeKeyId, currentMileage } = req.body;
  const newVehicle = new Vehicle({
    make,
    model,
    year,
    licensePlate,
    keyCafeKeyId,
    currentMileage,
  });
  await newVehicle.save();
  res.redirect("/vehicles");
};

exports.index = async (req, res) => {
  const vehicles = await Vehicle.find({}).sort({ make: 1, model: 1 });
  res.render("vehicles/index", {
    title: "Vehicles",
    vehicles,
  });
};
