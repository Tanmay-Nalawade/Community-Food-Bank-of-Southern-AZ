const Vehicle = require("../models/vehicle");

exports.index = async (req, res) => {
  const vehicles = await Vehicle.find({ "activeIssues.0": { $exists: true } })
    .populate("activeIssues.reportedBy", "firstName lastName email")
    .sort({ make: 1, model: 1 });

  const issues = [];
  vehicles.forEach((vehicle) => {
    vehicle.activeIssues.forEach((issue) => {
      issues.push({ vehicle, issue });
    });
  });

  issues.sort((a, b) => {
    if (a.issue.reviewed !== b.issue.reviewed) {
      return a.issue.reviewed ? 1 : -1;
    }
    return new Date(b.issue.reportedAt) - new Date(a.issue.reportedAt);
  });

  res.render("admin/issues/index", {
    title: "Vehicle Issues",
    issues,
    activeNav: "admin",
  });
};

exports.markReviewed = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.vehicleId);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const issue = vehicle.activeIssues.id(req.params.issueId);
  if (!issue) {
    return res.status(404).send("Issue not found.");
  }

  issue.reviewed = true;
  issue.reviewedBy = res.locals.currentUser._id;
  issue.reviewedAt = new Date();
  await vehicle.save();

  req.flash("success", "Issue marked as reviewed.");
  res.redirect("/admin/issues");
};

exports.dismiss = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.vehicleId);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const issue = vehicle.activeIssues.id(req.params.issueId);
  if (issue) {
    issue.deleteOne();
    await vehicle.save();
  }

  req.flash("success", "Issue removed.");
  res.redirect("/admin/issues");
};
