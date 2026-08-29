const Vehicle = require("../models/vehicle");

// To get the form for adding a new vehicle
exports.getAddVehicle = (req, res) => {
  res.render("vehicles/add", {
    title: "Add Vehicle",
  });
};

// To handle the submission of the new vehicle form
exports.postAddVehicle = async (req, res) => {
  const { make, model, year, licensePlate, keyCafeKeyId, currentMileage } =
    req.body;
  const newVehicle = new Vehicle({
    make,
    model,
    year: year ? Number(year) : undefined,
    licensePlate,
    keyCafeKeyId,
    currentMileage: Number(currentMileage) || 0,
  });
  await newVehicle.save();
  req.flash("success", `${newVehicle.make} ${newVehicle.model} added to the fleet.`);
  res.redirect("/vehicles");
};
