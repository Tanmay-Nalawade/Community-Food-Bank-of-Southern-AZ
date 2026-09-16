const Vehicle = require("../models/vehicle");
const { fetchPage, PAGE_SIZE } = require("../utils/pagination");

// Issues live inside each vehicle's activeIssues array, not their own
// collection, so paginating "all issues across all vehicles, unreviewed
// first" needs an aggregation ($unwind) rather than a plain find().
function issuesPipeline(skip, limit) {
  return [
    { $match: { "activeIssues.0": { $exists: true } } },
    { $unwind: "$activeIssues" },
    { $sort: { "activeIssues.reviewed": 1, "activeIssues.reportedAt": -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "activeIssues.reportedBy",
        foreignField: "_id",
        as: "reportedByUser",
      },
    },
  ];
}

function toRow(doc) {
  const reportedByUser = doc.reportedByUser?.[0];

  return {
    vehicle: {
      _id: doc._id,
      make: doc.make,
      model: doc.model,
      year: doc.year,
      licensePlate: doc.licensePlate,
    },
    issue: {
      ...doc.activeIssues,
      reportedBy: reportedByUser
        ? { firstName: reportedByUser.firstName, lastName: reportedByUser.lastName }
        : null,
    },
  };
}

async function fetchIssues(skip, limit) {
  const docs = await Vehicle.aggregate(issuesPipeline(skip, limit));
  return docs.map(toRow);
}

exports.index = async (req, res) => {
  const { items: issues, hasMore, nextSkip } = await fetchPage(fetchIssues, 0);

  res.render("admin/issues/index", {
    title: "Vehicle Issues",
    issues,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "admin-issues",
  });
};

exports.more = async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const { items: issues, hasMore } = await fetchPage(fetchIssues, skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/issues/_rows", { issues });
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
