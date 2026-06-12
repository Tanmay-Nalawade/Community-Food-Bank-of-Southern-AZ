const Vehicle = require("../models/vehicle");

// To display the list of all vehicles
exports.index = async (req, res) => {
  const vehicles = await Vehicle.find({}).sort({ make: 1, model: 1 });
  res.render("vehicles/index", {
    title: "Vehicles",
    vehicles,
  });
};



// To view details of a specific vehicle
exports.viewVehicle = async (req, res) => {
  const vehicleId = req.params.id;
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    return res.status(404).send("Vehicle not found");
  }
  res.render("vehicles/view", {
    title: `${vehicle.make} ${vehicle.model}`,
    vehicle,
  });
};